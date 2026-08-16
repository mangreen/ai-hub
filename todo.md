# todo.md — Active Sprint

## Phase 0 — 環境與 Cordis 基礎
- [x] pnpm monorepo 骨架
- [x] 安裝並驗證 `cordis` 套件實際可用（非憑記憶假設 API）
- [x] Service / inject / event 三個核心概念各寫一個可執行範例
- [x] `pnpm typecheck` 乾淨通過
- [x] 記錄 tsconfig 相容性坑（ERR-20260816）
- [x] 修掉 esbuild/tsx 在 Big Sur 上的相容性問題（改用 Node 內建 type-stripping）
- [ ] 你在自己機器上重跑一次 `pnpm install && pnpm typecheck && pnpm start`，確認修復生效
- [ ] 走一次 git 分支流程：`phase/0-environment-cordis-basics` → merge 回 `main`

## Phase 1 — Plugin Kernel 骨架（下一階段，尚未開始）
- [ ] 設計 `ctx.chat` / `ctx.agent` / `ctx.model` / `ctx.storage` service 介面
- [ ] ADR：service 邊界劃分理由
