# todo.md — Active Sprint

## Phase 0 — 環境與 Cordis 基礎 ✅ merged to main (`phase-0-complete`)
## Phase 1 — Plugin Kernel 骨架 ✅ merged to main (`phase-1-complete`)
## Phase 2 — Domain 層（TDD）✅ merged to main (`phase-2-complete`)

## Phase 2.5 — Phase 3 前置整理（本次要 commit/merge 的內容）
- [x] 研究 dsh `.agents/skills`，整合兩條規則進 CLAUDE.md 2.1 節（prose standard + pre-push checks）
- [x] 系統架構圖 + Cordis 依賴圖（Mermaid，語法已用 mermaid.parse() 驗證），放進 docs/architecture/
- [x] 全部原始碼 comment/文件審查一輪，修掉過期引用（已刪除的 Phase 0 demo 檔案、過期的 Phase 2 TODO）
- [x] `ModelService`/`ChannelService.register()` 改成回傳 effect disposer，TDD 補測試（10 個新測試）
- [x] 37 個測試全過、typecheck 乾淨、kernel 正常開機
- [x] 你在自己機器上重跑一次確認
- [x] git 分支流程：`phase/2.5-pre-phase3-housekeeping` → merge 回 `main`

## Phase 3 — Model Provider Plugins（下一階段，尚未開始）
- [ ] Ollama / OpenAI-相容端點（Claude/GPT/Gemini/Grok）/ NVIDIA build API，各自一個 plugin
- [ ] 都呼叫 `ctx.model.register(...)`，記得保留回傳的 disposer
