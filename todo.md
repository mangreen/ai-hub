# todo.md — Active Sprint

## Phase 0 — 環境與 Cordis 基礎 ✅ merged to main (`phase-0-complete`)
## Phase 1 — Plugin Kernel 骨架 ✅ merged to main (`phase-1-complete`)

## Phase 2 — Domain 層（TDD）
- [x] `chat/domain.ts`：Room / Message / sandbox 可見性規則，TDD（先寫測試看紅燈，再實作看綠燈）
- [x] `agent/domain.ts`：Agent / TaskAssignment
- [x] 27 個測試全過，100% coverage（`pnpm test`）
- [x] Message 帶 `sourceChannel` 欄位（ADR-0002 的預留）
- [x] 測試工具選型記錄在 MEM-20260816-phase2-domain-and-testing.md
- [x] 你在自己機器上重跑一次確認（尤其 `pnpm test` 的 glob pattern 在 Big Sur 上行為一致）
- [x] git 分支流程：`phase/2-domain-layer` → merge 回 `main`

## Phase 3 — Model Provider Plugins（下一階段，尚未開始）
- [ ] Ollama / OpenAI-相容端點（Claude/GPT/Gemini/Grok）/ NVIDIA build API，各自一個 plugin
- [ ] 都呼叫 `ctx.model.register(...)`（Phase 1 已經是可用的 registry）
