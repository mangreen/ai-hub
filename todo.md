# todo.md — Active Sprint

## Phase 0 — 環境與 Cordis 基礎 ✅ merged to main (`phase-0-complete`)
## Phase 1 — Plugin Kernel 骨架 ✅ merged to main (`phase-1-complete`)
## Phase 2 — Domain 層（TDD）✅ merged to main (`phase-2-complete`)
## Phase 2.5 — Phase 3 前置整理 ✅ merged to main (`phase-2.5-complete`)
## Phase 3 — Model Provider Plugins ✅ merged to main (`phase-3-complete`)
## Phase 4 — 持久化與附件 ✅ merged to main (`phase-4-complete`)
## Phase 5 — 多 Agent 協作 ✅ merged to main (`phase-5-complete`)

## Phase 5.5 — 執行沙盒後端實作 ✅ Seatbelt + Docker 完成，尚未 merge
- [x] 更正上一輪的錯誤說法：這個 Phase 不需要等 tool calling（executor 本身
      獨立於「誰呼叫它」）
- [x] Seatbelt executor：`buildSeatbeltProfile`（純函式，TDD）+ `execute()`
      （injectable spawn，TDD）。SBPL 設計查證 Anthropic 自己的
      `sandbox-runtime` 專案，不是猜的。12 個測試。
- [x] Docker executor（新增，非原計畫）：`buildDockerArgs`（純函式，TDD）+
      `execute()`（injectable spawn，TDD）。確認你本機 Docker Desktop
      4.12.0/Engine 20.10.17 足夠用，不用管 Big Sur 相容性問題。13 個測試。
- [x] 兩個都掛進 kernel bootstrap，`pnpm start` 顯示
      `sandbox executors registered: [ 'seatbelt', 'docker' ]`
- [x] `scripts/verify-seatbelt.ts`/`scripts/verify-docker.ts`——這台開發機是
      Linux，無法驗證隔離真的有效，這兩支腳本要在真實環境上跑才算數
- [x] ADR-0008 記錄完整決策過程 + 已知限制（v1 不擋網路、Seatbelt 沒防
      file-write-unlink bypass）
- [x] E2B 雲端 executor 延後（不是取消），原因見 ADR-0008
- [x] 160 個測試全過、typecheck 乾淨、clean-room 重裝驗證過
- [x] **你在自己的 Mac 上跑 `pnpm verify:seatbelt`，在有 Docker Desktop 的環境跑
      `pnpm verify:docker`，確認真的隔離有效**——這是這次最重要的待辦，
      沒跑過這兩個腳本，這兩個 executor 的安全性都只是「看起來對」，不是「證實對」
- [x] git 分支流程：commit 這次的變更 → merge 回 `main`

## Phase 5.5 剩餘（下一階段，尚未開始）
- [ ] E2B 雲端 executor（需要先查證底層 wire protocol，或決定要不要依賴官方 SDK）
- [ ] bwrap/Landlock 介面定義（`isAvailable()` 在非 Linux 機器上誠實回 false）
- [ ] 補 Seatbelt 的 file-write-unlink bypass 防護（如果真的要拿來執行不受信任的指令）
- [ ] tool calling 設計（沒有它，`ctx.sandbox` 永遠不會被 `task-graph` 真正呼叫）——
      又是一輪「先想後做」

## Phase 6 — API + 聊天 UI MVP（更後面，尚未開始）
- [ ] REST + WebSocket，`ctx.api`
- [ ] workflow definition CRUD 端點、workflow run 狀態查詢、activity log 搜尋端點
- [ ] Web UI：房間列表、選 Agent 看歷史、workflow 視覺化編輯器
