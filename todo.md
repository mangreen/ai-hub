# todo.md — Active Sprint

## Phase 0 — 環境與 Cordis 基礎 ✅ merged to main (`phase-0-complete`)
## Phase 1 — Plugin Kernel 骨架 ✅ merged to main (`phase-1-complete`)
## Phase 2 — Domain 層（TDD）✅ merged to main (`phase-2-complete`)
## Phase 2.5 — Phase 3 前置整理 ✅ merged to main (`phase-2.5-complete`)
## Phase 3 — Model Provider Plugins ✅ merged to main (`phase-3-complete`)
## Phase 4 — 持久化與附件 ✅（等你在自己機器上跑過 + merge）

## Phase 5 前置設計（ADR-0005/0006/0007 + 兩次改名）✅ 已確認，準備 commit
- [x] ADR-0005/0006/0007 三份設計文件
- [x] `sandboxed` → `memoryIsolated` → `isolated`（兩次改名，都有測試保護，82 測試全過）

## Phase 5 — 多 Agent 協作：第一塊「registry + schema」✅ 完成，尚未 commit
- [x] `ctx.orchestrator`（OrchestratorService，registry pattern）+ 5 個測試
- [x] `ctx.sandbox`（SandboxService，registry pattern，只做介面）+ 6 個測試
- [x] `orchestrator/domain.ts`：`WorkflowDefinition`/`TaskNode`/`TaskEdge`/`WorkflowRunResult`、
      `createWorkflowDefinition`、`validateAcyclic`（Kahn's algorithm）+ 16 個測試
- [x] `StorageService` schema 新增 4 張表（workflow_definitions/workflow_runs/
      task_node_runs/activity_log）+ 5 個 activity_log 索引 + 5 個新測試
- [x] 兩個新 service 掛進 kernel bootstrap（`src/index.ts`）
- [x] 113 個測試全過、typecheck 乾淨、clean-room 重裝驗證過、無 .env 也能開機
- [x] 你在自己機器上重跑一次確認
- [x] git 分支流程：`phase/5-multi-agent-orchestration` → merge 回 `main`
      （建議先 commit 設計文件+改名，再 commit 這次的 registry+schema，同一個 branch）

## Phase 5 — 多 Agent 協作：第二塊「task-graph 預設策略」（下一輪，尚未開始）
- [ ] 預設 orchestration strategy plugin：`task-graph`，`inject: ['orchestrator', 'agent', 'model', 'chat', 'storage']`
- [ ] 執行邏輯：用 `validateAcyclic` 算出的拓撲順序跑 node，呼叫 `ctx.model` 完成任務
- [ ] 真正 emit `'agent/task-assigned'`、`'chat/message'`
- [ ] 寫 `activity_log` 記錄每個 model call（kind/target/duration_ms，metadata 不放原始 payload）
- [ ] 跑通「Allen 寫前端 / Ben 寫後端」範例

## Phase 5.5 — 執行沙盒後端實作（尚未開始，等 tool calling 一起做）
- [ ] Seatbelt executor（macOS，優先，本機可測）+ 先寫測試證明限制真的生效
- [ ] 雲端 API executor（例如 E2B）
- [ ] bwrap/Landlock 介面留著，`isAvailable()` 在這台機器誠實回 false
