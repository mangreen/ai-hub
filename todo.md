# todo.md — Active Sprint

## Phase 0 — 環境與 Cordis 基礎 ✅ merged to main (`phase-0-complete`)
## Phase 1 — Plugin Kernel 骨架 ✅ merged to main (`phase-1-complete`)
## Phase 2 — Domain 層（TDD）✅ merged to main (`phase-2-complete`)
## Phase 2.5 — Phase 3 前置整理 ✅ merged to main (`phase-2.5-complete`)
## Phase 3 — Model Provider Plugins ✅ merged to main (`phase-3-complete`)

## Phase 4 — 持久化與附件
- [x] 驗證 `node:sqlite` 實際 API（不憑印象），寫進 MEM
- [x] Schema 設計：rooms/room_members/messages/agents/attachments，全部集中在 StorageService
- [x] `StorageService`：run/get/all + saveAttachment，TDD（7 個測試）
- [x] 驗證 Service class 的 `static inject`（先寫最小重現腳本）
- [x] `ChatService` 接上真持久化：createRoom/getRoom/addMember/postMessage/listMessages/canAgentViewRoom，TDD（13 個測試）
- [x] `AgentService` 接上真持久化：createAgent/getAgent/listAgents，TDD（7 個測試）
- [x] ADR-0004 + 更新 Cordis 依賴圖（chat/agent 現在 inject storage）
- [x] `.gitignore` 加 `data/`（SQLite 檔案 + 附件不進版控）
- [x] 抓到並修掉一個真的 bug：`??` 對空字串 env var 不 fallback（ERR-20260817）
- [x] 82 個測試全過、typecheck 乾淨、真實檔案路徑（非 :memory:）也驗證過
- [x] 你在自己機器上重跑一次確認
- [x] git 分支流程：`phase/4-persistence-and-attachments` → merge 回 `main`

## Phase 5 — 多 Agent 協作（Agent Loop/Graph 核心）（下一階段，尚未開始）
- [ ] 任務圖（DAG）資料結構、manager plugin
- [ ] `AgentService` 補上 task-assignment 持久化（Phase 4 故意沒做，因為這才是真正需要狀態的地方）
- [ ] 用 Cordis event 系統做 Agent 間通訊（`agent/task-assigned` 事件目前只有型別宣告，還沒人 emit）
