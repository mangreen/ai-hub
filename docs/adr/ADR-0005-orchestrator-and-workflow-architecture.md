# ADR-0005：Orchestrator 為可替換插件 + Workflow DAG 可持久化/UI 編輯 + Activity Log

Date: 2026-08-18
Status: Accepted（設計定案，實作尚未開始——這份 ADR 先於 Phase 5 程式碼）

## 背景

Phase 5 原計畫（見 CLAUDE.md 舊版）是「`AgentService` 補上 task DAG / manager loop」，
把整個多 Agent 協作邏輯寫死在 `AgentService` 裡。開始寫之前，你提出三個要考慮的方向：

1. Agent loop/graph/harness 本身也要是可替換的插件。
2. 任務圖（DAG）要考慮未來能透過 UI 查看/編輯/創建整個工作流程。
3. Agent 任務要考慮未來能透過 UI 查看：呼叫了什麼外部服務、調用了什麼 tool、花了多少時間，
   並支援搜尋。

這三點都會影響 Domain 層跟 Service 邊界的設計，照 Section 5（Graph/DAG Dependency
Management）的規則，要先更新架構圖、想清楚 trade-off，才能寫 code——這份 ADR 就是那個
「先想清楚」的產出，Phase 5 的實作要照這裡定的介面做。

## 決策 1：新增 `ctx.orchestrator`，Agent Loop 是可替換插件

**問題：** 如果 task DAG / manager loop 寫死在 `AgentService` 裡，之後想換一種協作策略
（例如換成 round-robin、supervisor-worker、或完全不同的 loop 邏輯）就要動 `AgentService`
本身，違反「萬物皆插件」。

**決策：** 新增第六個 service `ctx.orchestrator`，跟 `ctx.model`/`ctx.channel` 一樣是
registry pattern：

```ts
interface OrchestrationStrategy {
  name: string
  runWorkflow(definition: WorkflowDefinition): Promise<WorkflowRunResult>
}
```

Phase 5 只會實作**一個**策略（`task-graph`，就是原本規劃的 manager-loop），註冊進
`ctx.orchestrator`。`AgentService` 維持只管 Agent CRUD（Phase 4 已完成，不變）；
`ctx.orchestrator` 才是管「Agent 之間怎麼協作」。

**為什麼叫 `orchestrator` 不叫 `harness`：** 你的訊息裡「loop/graph/harness」三個詞
交替使用，指的是同一件事。`orchestrator` 是這個領域比較標準、望文生義的字，但文件裡會
註明這就是原本 CLAUDE.md 標題「AI Loop/Graph Engineering」講的那個東西，避免之後看
文件的人以為是兩個不同概念。

## 決策 2：Workflow 拆成 Definition / Run 兩層，全部可持久化

**問題：** 如果 DAG 只是 manager agent 執行當下臨時算出來的記憶體結構，UI 根本沒有東西
可以顯示/編輯——使用者要能「看到」「編輯」「創建」整個工作流程，代表 DAG 本身必須是
一個獨立、可序列化、有穩定 id 的持久化實體，不是執行的副產品。

**決策：** 比照 Airflow/Temporal/n8n 的慣例，拆成兩層：

```
WorkflowDefinition   -- 圖本身：nodes + edges，可被人類或 manager agent 創建/編輯
  id, name, roomId, nodes: TaskNode[], edges: TaskEdge[], createdAt, updatedAt

TaskNode
  id, agentId, task            -- task 沿用 Phase 2 agent/domain.ts 的 TaskAssignment 概念

TaskEdge
  from: nodeId, to: nodeId     -- to 依賴 from 先完成

WorkflowRun          -- 一次執行：同一個 Definition 可以跑很多次（重跑失敗的、換參數重跑）
  id, workflowId, status, startedAt, finishedAt

TaskNodeRun           -- 每次 run 裡，每個 node 的執行狀態
  id, runId, nodeId, agentId, status, startedAt, finishedAt
```

`WorkflowDefinition.roomId` 把工作流程掛回 `ctx.chat` 的 Room——對應原始需求的兩個範例
（範例1 使用者手動開房間分配 Agent；範例2 manager agent 自動開房間、自動規劃分工），
兩種「誰創建了這個 workflow」的情境都能用同一個資料模型表達，不用做兩套。

**必須驗證 DAG 無環（acyclic）**——這是另一個適合寫成純函式、先寫測試的邏輯
（`validateAcyclic(nodes, edges)`），跟 Phase 2 的 `canAgentViewRoom` 同一種套路。

## 決策 3：`activity_log`——誰呼叫了什麼、花多久，可搜尋

**問題：** 一個 workflow run 底下，某個 Agent 可能呼叫了某個 model provider、之後可能還會
呼叫某個 tool（tool calling 目前還沒做，但這張表要留欄位給它），這些「誰在什麼時候做了
什麼、花了多久」的紀錄，如果不刻意記錄，事後 UI 什麼都查不到。

**決策：**

```
activity_log
  id, workflow_run_id, task_node_run_id, agent_id,
  kind         -- 'model_call' | 'tool_call' | 'external_service'
  target       -- 例如 'openrouter:nvidia/nemotron-3-ultra-550b-a55b:free'
  started_at, finished_at, duration_ms,
  status       -- 'running' | 'succeeded' | 'failed'
  metadata     -- JSON，額外細節
```

`workflow_run_id`/`agent_id`/`kind`/`target`/`started_at` 都要建索引，支援「搜尋」
這個需求——先用一般的 indexed 查詢（`WHERE kind = ? AND target LIKE ?`），不要一開始就
上 SQLite FTS5 全文搜尋：`node:sqlite` 是否支援 FTS5 目前沒驗證過，等真的需要全文搜尋
（例如搜 `metadata` 裡的自由文字）再去查證、驗證，不要現在假設它能用（YAGNI + 一貫的
「先驗證再蓋」原則，見 MEM-20260817-phase4-storage-and-static-inject.md 的做法）。

**寫入者是 orchestration strategy plugin 自己**（因為它才是真正發起 model/tool 呼叫的
角色），不是一個獨立的 service——StorageService 一樣只提供通用的 `run/get/all`，
不需要為了 activity log 再多開一個 service（YAGNI，等真的有第二個東西也要寫 activity
log 時再考慮要不要抽成獨立 service）。

**安全guardrail（呼應 4.3 節）：** `metadata` 絕對不能塞進原始 API key 或完整的
request/response body（可能夾帶敏感內容）——Phase 5 實作時只記錄「呼叫了什麼、花多久、
成功與否」這類 metadata，不記錄 payload 全文。

## Trade-off Analysis

**Pros：**
- `ctx.orchestrator` 讓「換一種協作策略」變成加一個 plugin，不用動 Agent CRUD 邏輯。
- Definition/Run 分離，是「之後真的要做 UI 編輯工作流程」唯一合理的資料模型，現在做
  比 Phase 6 才回頭改便宜很多。
- `activity_log` 讓 Phase 5 一次把「多 Agent 協作」跟「看得到花了多少錢/多少時間」
  兩件事一起解決，不用等到出問題才發現沒有任何紀錄可查。
- `'chat/message'`、`'agent/task-assigned'` 這兩個從 Phase 1/2 就保留但沒人 emit 的
  事件，終於在 Phase 5 派上用場。

**Cons：**
- Phase 5 的範圍變大了——原本只是「一個 manager plugin」，現在是「一個 registry +
  一個 schema（4 張新表）+ 一個預設策略 + activity logging」。實際開始寫的時候，
  可能要再拆成更小的可執行單元（例如先做 registry + schema，再做預設策略），
  符合 Section 1「不要一次生成大段程式碼，拆到最小可執行單位」。
- `activity_log` 的 `duration_ms`/`target` 等欄位命名現在是最佳猜測，真的開始記錄
  tool calling 之後，可能要回頭調整（可接受，這是資料模型會隨需求演化的正常過程）。

## 對後續 Phase 的影響

- **Phase 6（API + UI）**：需要新增 workflow definition 的 CRUD 端點、workflow run
  狀態查詢/串流、activity log 搜尋端點、`ctx.orchestrator.list()` 讓 UI 顯示可選的
  協作策略。
- **Phase 7（插件市場）**：orchestration strategy 成為第三種「可透過市場管理」的插件
  類別，跟 model provider、channel adapter 並列。
- **Phase 9（安全/可觀測性）**：`activity_log` 已經是 Phase 5 就開始做的可觀測性基礎，
  Phase 9 主要是補 CI/secrets 掃描這些收尾工作，不用重新設計 tracing。

## 影響

- `docs/architecture/system-architecture.md`、`docs/architecture/cordis-dependency-graph.md`
  已更新反映 `ctx.orchestrator` 的存在（見這兩份文件的 Phase 5 標註）。
- CLAUDE.md Phase 5 章節已改寫，範圍比舊版大，交付物列表也更新。
- 這份 ADR 定案，但 Phase 5 的程式碼還沒開始寫——下一步是你確認這個方向後，才開始
  實際的 TDD 實作。
