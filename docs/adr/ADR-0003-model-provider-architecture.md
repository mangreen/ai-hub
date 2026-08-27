# ADR-0003：Model Provider 架構 — 共用 OpenAI-相容 client + 獨立 Anthropic client

Date: 2026-08-17
Status: Accepted

## 背景

Phase 3 要接：Ollama（本地）、OpenAI、Google Gemini、xAI Grok、NVIDIA NIM
（build.nvidia.com）、OpenRouter（新增，使用者要求）、Anthropic Claude，共 7 家。
原本 CLAUDE.md 把 Claude/GPT/Gemini/Grok 都寫在同一句「OpenAI-相容端點」底下，
implementation 之前先查證每一家「OpenAI 相容」的**實際成熟度**，結果跟原本假設不完全一樣。

## 查證結果（2026-08-17，非憑印象）

| Provider | Base URL | OpenAI 相容？ | 備註 |
|---|---|---|---|
| Ollama | `http://localhost:11434/v1` | 是，穩定 | 本地執行，通常不需要 API key |
| OpenAI | `https://api.openai.com/v1` | 本尊 | — |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | 官方支援，正式功能 | Google 自己的文件把這個當正式功能講，不是測試用 |
| xAI Grok | `https://api.x.ai/v1` | 官方支援，就是它的標準 API 介面 | 沒有另一套「原生」格式 |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | 官方支援，正式功能 | 底層是 vLLM 的 OpenAI-Compatible Server |
| OpenRouter | `https://openrouter.ai/api/v1` | 官方明確稱為「drop-in replacement」 | 使用者這次要求新增的 provider |
| **Anthropic Claude** | `https://api.anthropic.com/v1/` | **有，但官方文件明講只給「測試/評估」用，不是 production-ready**——不支援 prompt caching、不支援 thinking、tool schema 不保證遵守 | 正式功能是原生 Messages API（`/v1/messages`） |

**結論：Claude 是唯一的例外。** 其他六家可以共用同一套「OpenAI-相容 client」，只是
base URL、API key 環境變數、要不要帶 API key（Ollama 通常不用）不一樣。Claude 用
Anthropic 自己的 Messages API 格式（`system` 是獨立欄位、`max_tokens` 必填、回應內容
是 `content` 陣列而不是 `choices[0].message.content`），不能硬塞進同一套 client。

## 決策

```bash
src/plugins/model/
  types.ts                    共用的 ChatMessage / ChatCompletionResult 型別
  openai-compatible/
    client.ts                 chatCompletion() — 六家共用的 HTTP 呼叫邏輯
  anthropic/
    client.ts                 anthropicMessage() — Claude 專用，原生 Messages API
  ollama/index.ts              各自一個小 plugin，只提供 config，呼叫 openai-compatible 的 factory
  openai/index.ts
  gemini/index.ts
  grok/index.ts
  nvidia-nim/index.ts
  openrouter/index.ts
  claude/index.ts              呼叫 anthropic 的 factory
```

每個 provider plugin 都是 `inject: ['model']`，`apply(ctx)` 呼叫 `ctx.model.register(...)`
並保留回傳的 disposer（見 MEM-20260816-registrations-as-effects.md）。新增第 8 家
OpenAI-相容的 provider，只需要新增一個十幾行的檔案（base URL + env var 名稱），
不用碰共用的 client 邏輯——這是「萬物皆插件」在 Phase 3 的具體驗證。

## Trade-off Analysis

**Pros：**
- 六個 provider 共用同一套已測試過的 HTTP 邏輯，bug 只要修一個地方。
- 之後要加第 8、9 家 OpenAI-相容 provider（很可能發生，這領域一直在變）成本极低。
- Claude 獨立出來，反而更誠實地反映現實——硬把它塞進 OpenAI 相容格式，會在正式使用時
  無預警失去 prompt caching、thinking 等功能，這對「多 Agent 真的要幹活」的專案是不能接受的取捨。

**Cons：**
- 兩套 client 邏輯要分別維護、分別測試（用 mock fetch，不打真正的 API，見各自的
  `client.test.ts`）。
- `ChatCompletionResult` 目前刻意設計得很陽春（只有 `content`/`model`），不支援 streaming、
  tool calling、thinking——這些留給之後真的需要時再加（YAGNI），現在硬做只是不會用到的複雜度。

## 對機密管理（4.3 節）的影響

這是本專案第一次真的需要 API key。`.env.example` 新增六個 provider 各自的 key 變數
（Ollama 不需要）。`package.json` 的 `start`/`dev` 改用
`node --env-file-if-exists=.env`——用 `-if-exists` 版本，這樣沒建立 `.env`
（例如只想跑 Ollama 的人）也不會直接噴錯關機。

## 影響

- `ModelProvider` 介面從 Phase 1 的空殼（只有 `name`）補上 `complete(messages, model)`。
- `ctx.model.register()` 的呼叫方每個 provider plugin 都要記得保留 disposer——這件事
  在 Phase 1 已經是 effect-based，這裡只是第一次真的有人用它。
