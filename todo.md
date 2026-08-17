# todo.md — Active Sprint

## Phase 0 — 環境與 Cordis 基礎 ✅ merged to main (`phase-0-complete`)
## Phase 1 — Plugin Kernel 骨架 ✅ merged to main (`phase-1-complete`)
## Phase 2 — Domain 層（TDD）✅ merged to main (`phase-2-complete`)
## Phase 2.5 — Phase 3 前置整理 ✅ merged to main (`phase-2.5-complete`)

## Phase 3 — Model Provider Plugins
- [x] 查證 7 家 provider 的 OpenAI 相容性現況（非憑印象），寫成 ADR-0003
- [x] `openai-compatible/client.ts`：六家共用 HTTP client，TDD（9 個測試）
- [x] `anthropic/client.ts`：Claude 原生 Messages API client，TDD（8 個測試）
- [x] 7 個 provider plugin（ollama/openai/gemini/grok/nvidia-nim/openrouter/claude）
- [x] 新增 OpenRouter（使用者要求）
- [x] 整合測試：7 個 provider 一起掛載，驗證 ctx.model.list() 正確
- [x] 實驗驗證 Cordis fiber 自動清理，修正先前 MEM 裡沒驗證過的建議
- [x] `.env.example` + `package.json` 改用 `--env-file-if-exists`
- [x] 55 個測試全過、typecheck 乾淨、無 .env 也能正常開機
- [x] 你在自己機器上重跑一次確認（可以順便测试真的填一個 API key 進去打看看）
- [x] git 分支流程：`phase/3-model-provider-plugins` → merge 回 `main`

## Phase 4 — 持久化與附件（下一階段，尚未開始）
- [ ] SQLite schema（rooms/messages/agents/attachments）
- [ ] `ChatService` 接上真正的持久化，改用 `domain.ts` 的 createRoom/addMember 等函式
