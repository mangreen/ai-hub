# todo.md — Active Sprint

## Phase 0 — 環境與 Cordis 基礎
- [x] 開發環境建立，規劃多階段學習路線，適配硬體限制並簡化企業規範
- [x] 跑一個「hello plugin」示例、git 分支流程測試一輪
- [x] git 分支流程：`phase/0-environment-cordis-basics` → merge 回 main (tag: `phase-0-complete`)

## Phase 1 — Plugin Kernel 骨架
- [x] 設計 `ctx.chat` / `ctx.agent` / `ctx.model` / `ctx.storage` / `ctx.channel` 五個 service 邊界
- [x] `ADR-0001`：為何選 Cordis
- [x] `ADR-0002`：為何預留 `ctx.channel`（WhatsApp/Messenger/企業微信，個人 WeChat 不做）
- [x] 五個 service 掛載進 kernel，`pnpm typecheck` + `pnpm start` 都驗證過
- [x] 你在自己機器上重跑一次確認
- [x] git 分支流程：`phase/1-plugin-kernel-skeleton` → merge 回 `main`

## Phase 2 — Domain 層（TDD）（下一階段，尚未開始）
- [ ] Room / Message / Agent / SandboxPolicy 純函式 + 單元測試（先寫測試）
- [ ] Message 要帶 `sourceChannel` 欄位（來自 ADR-0002 的預留，見 CLAUDE.md Phase 2 備註）
