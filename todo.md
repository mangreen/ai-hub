# todo.md — Active Sprint

## Phase 0 — 環境與 Cordis 基礎 ✅ merged to main (`phase-0-complete`)
## Phase 1 — Plugin Kernel 骨架 ✅ merged to main (`phase-1-complete`)
## Phase 2 — Domain 層（TDD）✅ merged to main (`phase-2-complete`)
## Phase 2.5 — Phase 3 前置整理 ✅ merged to main (`phase-2.5-complete`)
## Phase 3 — Model Provider Plugins ✅ merged to main (`phase-3-complete`)
## Phase 4 — 持久化與附件 ✅ merged to main (`phase-4-complete`)

## Phase 5 — 多 Agent 協作 ✅ 完成，尚未 merge
- [x] 第一塊（已 commit）：`ctx.orchestrator`/`ctx.sandbox` registry + workflow schema
- [x] `topologicalOrder` 從 `validateAcyclic` 抽出（TDD，4 個新測試）
- [x] `parseModelRef`（TDD，5 個新測試，含 OpenRouter 帶冒號模型名稱案例）
- [x] `OrchestratorService` 加 `createWorkflow`/`getWorkflow`/`run`（TDD，7 個新測試）
- [x] `ChatService.postMessage` 真正 emit `'chat/message'`（TDD，1 個新測試）
- [x] `task-graph` 預設策略：拓撲順序執行、查 Agent、呼叫 model、發回 chat、
      記錄 workflow_runs/task_node_runs/activity_log、emit `'agent/task-assigned'`
      （TDD，5 個新測試：成功路徑含依賴順序驗證、獨立分支、失敗路徑 x2）
- [x] 掛進 kernel bootstrap，`pnpm start` 顯示 `orchestration strategies registered: [ 'task-graph' ]`
- [x] 135 個測試全過、typecheck 乾淨、clean-room 重裝驗證過
- [x] 你在自己機器上重跑一次確認
- [x] git 分支流程：commit 這次的變更（延續上次的 phase/5 分支）→ merge 回 `main`

## Phase 5.5 — 執行沙盒後端實作（下一階段，尚未開始）
- [ ] Seatbelt executor（macOS，優先，本機可測）+ 先寫測試證明限制真的生效
- [ ] 雲端 API executor（例如 E2B）
- [ ] bwrap/Landlock 介面留著，`isAvailable()` 在這台機器誠實回 false
- [ ] 這個 Phase 需要先有 tool calling（目前完全沒有）——動手前要先想清楚
      tool calling 怎麼設計，可能又是一輪「先想後做」

## Phase 6 — API + 聊天 UI MVP（更後面，尚未開始）
- [ ] REST + WebSocket，`ctx.api`
- [ ] workflow definition CRUD 端點、workflow run 狀態查詢、activity log 搜尋端點
- [ ] Web UI：房間列表、選 Agent 看歷史、workflow 視覺化編輯器
