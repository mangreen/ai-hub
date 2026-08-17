# MEM: Phase 3 — Provider 相容性研究 + Fiber 自動清理驗證
Date: 2026-08-17
Tags: [model-provider, cordis, fiber, openrouter]

## Summary
Phase 3 開始前查證了 7 家 provider 的 API 相容性現況（結果見
`docs/adr/ADR-0003-model-provider-architecture.md`），並用實驗證明了 Cordis 的
`ctx.effect()` 註冊會跟著「呼叫當下的 fiber」走，不是跟著「哪個物件的 `.ctx` 被拿去呼叫
`.effect()`」走——這件事直接影響了 7 個 provider plugin 檔案該怎麼寫。

## Details

**API 相容性查證（不是憑印象）：** Ollama/OpenAI/Gemini/Grok/NVIDIA NIM/OpenRouter
六家的 OpenAI 相容端點都是官方文件明確支援的正式功能；只有 Anthropic 的 OpenAI 相容層
被官方文件自己標注「只給測試/評估用，不建議正式環境」（沒有 prompt caching、沒有
thinking、tool schema 不保證遵守）。所以 Claude 走原生 Messages API，其他六家共用一套
`openai-compatible/client.ts`。完整比較表在 ADR-0003。

**Fiber 自動清理的實驗驗證：** 寫了一個最小重現：一個 `Registry` service 的 `add()`
方法內部用 `this.ctx.effect(...)` 註冊東西，然後從**另一個** plugin（`provider-a`）呼叫
`ctx.registry.add(...)`。手動 `await fiber.dispose()`（`ctx.plugin()` 回傳的 `Fiber`
物件的 `.dispose()`）掉 `provider-a` 這個 plugin 本身之後，`Registry` 裡的項目也自動被移除
了——即使 `add()` 內部用的是 `this.ctx`（Registry 自己的 context），不是呼叫端的 context。
這證明 Cordis 的 effect tracking 是跟著「目前正在執行的 fiber」走（類似 React hooks
的 ambient tracking），不是跟著 method 是哪個物件的一樣。

**結論：7 個 provider plugin 檔案（`ollama/index.ts` 等）都不用手動存
`ctx.model.register(...)` 的回傳值**——plugin 被卸載時自動清理。這也修正了
`MEM-20260816-registrations-as-effects.md` 原本沒驗證過就寫的建議（「把 disposer 存
起來」），已經回頭把那份 MEM 更新成有驗證過的版本。

**OpenRouter 是這次新增的第 6 個 OpenAI-相容 provider**（使用者要求），因為架構本來就是
「共用 client + 各自一個小 config 檔」，加這一家的成本就是一個十幾行的檔案，沒有動到
共用邏輯——ADR-0003 講的「新增第 8 家成本很低」這件事，這次剛好在同一輪對話裡就驗證了一次
（OpenRouter 算第 6 家共用 client 的 provider，不是第 8 家，但驗證的是同一個機制）。

## When to Use
之後如果要加第 7、8 家 OpenAI-相容 provider（例如 Together AI、Groq、DeepSeek 官方
API 等），照 `openrouter/index.ts` 的樣子抄：一個檔案、base URL + API key 環境變數、
呼叫 `createOpenAICompatibleProvider(name, config)`，不用碰 `client.ts`。
如果新 provider 的 API 不是 OpenAI 相容格式（像 Claude 那樣），才需要照
`anthropic/client.ts` 的模式另外寫一個獨立 client。
