# ADR-0007：Orchestrator 自己寫 vs 用現成框架；DAG 儲存用 relational table 不用 graph DB

Date: 2026-08-19
Status: Accepted（補充/細化 ADR-0005，不是推翻——ADR-0005 的 registry pattern 設計不變）

## 背景

ADR-0005 定案「`ctx.orchestrator` 是可替換插件」之後，你問了兩個更具體的問題：
1. `ctx.orchestrator` 的預設策略要自己寫，還是用 LangGraph.js / openai-agents-js
   （後者似乎直接支援 Sandbox Agents）？
2. DAG 資料結構要不要用 [sqlite-graph](https://github.com/michaeloboyle/sqlite-graph)
   這個 SQLite graph DB 外掛？

兩個都直接查證過，不是憑印象回答。

## 問題 1：Orchestrator 自己寫，還是用現成框架

### sqlite-graph 先說結論：不用

實際打開這個 repo 查證，三個理由都是硬指標，不是「這個專案還很年輕所以不確定」這種模糊判斷：

1. **還沒發布到 npm**（README 自己寫的：「⚠️ Not yet published to npm」）——沒辦法
   `pnpm add`，只能 git clone 下來自己 build，直接破壞我們整套可重現安裝的工作流程。
2. **底層用 `better-sqlite3`**（README「Built with」欄位寫的）——這正是 ADR-0004
   刻意避開的那個東西：native addon，跟 Big Sur 上 `esbuild` 炸掉是同一類風險
   （見 `error/ERR-20260816-esbuild-bigsur-incompatible.md`）。用它等於把 Phase 4
   才解決掉的問題重新引進來。
3. **作者自己講的狀態**：「Alpha - core functionality working, but not recommended
   for production use yet」，測試套件本身有 memory crash（「Jest worker memory
   crashes on coverage runs」），4 個 star、1 個 fork、單一維護者。

而且功能面也不對版：sqlite-graph 解決的是「完整圖資料庫」（最短路徑、pattern
matching、BFS/DFS traversal 這種通用圖查詢）——我們的 workflow DAG 就十幾個 node，
只需要「存起來、驗證無環、照拓撲順序執行」，是一個遠比「圖資料庫」小的問題，
用得上的就只有一般 SQL 就能做到的事。

**決策：不用 sqlite-graph（也不用其他圖資料庫），DAG 直接存在既有的 `StorageService`
（`node:sqlite`）裡，用一般 relational table。**

### Orchestrator：自己寫，不用 LangGraph.js 或 openai-agents-js

**LangGraph.js（`@langchain/langgraph`）查證結果：**
成熟、大量使用（週下載量四萬多，Replit/Uber/LinkedIn/GitLab 都在用），但：
- 它的核心賣點是**支援循環（cycle）跟動態路由**——這跟我們的需求正好相反：
  ADR-0005 明確要求 workflow 必須是**無環**的 DAG（`validateAcyclic`）。查到的資料
  裡有一句話講得很準：「如果你的 agent workflow 是完全可預測的（沒有條件分支、
  沒有迴圈），簡單的循序 pipeline 會比 graph-based 架構更划算」——這句話講的
  正是我們的情境。
- 會拉進整個 LangChain 生態系依賴（`@langchain/core` 起跳），跟專案「極致精簡輕量」
  的非功能性需求衝突。
- 它自己的 persistence（checkpointer）預設用 Postgres/Redis，內建的 `MemorySaver`
  「只適合開發用」——要接我們已經做好的 `node:sqlite` persistence，得自己寫橋接層，
  等於是「用了框架，但框架最有價值的那塊（checkpointing）我們還是繞過去自己做」。

**openai-agents-js（`@openai/agents`）查證結果：**
你提到的「似乎直接支援 Sandbox Agents」——**查證後確認是對的，但有時效性細節要
更正**：2026 年 4 月的官方公告當時明講「Sandbox 功能先上 Python，TypeScript
支援待未來版本」；但直接查最新的 `openai/openai-agents-js` repo（更新於約 3 週前，
即最近）確認 **TypeScript 版的 Sandbox Agents 現在真的有了**——`SandboxAgent` +
`UnixLocalSandboxClient`（macOS/Linux 本機）/ `DockerSandboxClient`（容器）/
七家雲端託管 provider（Blaxel、Cloudflare、Daytona、**E2B**、Modal、Runloop、
Vercel）。**但官方文件自己標注 Sandbox Agents 目前是 Beta。**

不採用的理由：
- **Sandbox Agents 還是 beta**——不適合當作學習專案裡「執行安全性」這個核心功能的
  地基，尤其我們自己都還沒驗證過 `UnixLocalSandboxClient` 在 macOS 上實際用的是
  什麼隔離機制（是真的 Seatbelt/sandbox-exec profile，還是比較輕量的 workspace
  範圍限制？查到的資料沒講到這麼細，動手前必須自己驗證，不能假設它等於「真的安全」）。
- **名義上 provider-neutral，實務上是 OpenAI-native**（查到的原文：「Provider-neutral
  in theory via the Model interface, OpenAI-native in fact via the built-in
  classes」）——我們在 Phase 3（ADR-0003）已經投資做了一個真正 provider-中立的
  `ctx.model` registry，橫跨七家。採用 openai-agents-js 當 orchestrator，等於要嘛
  只把它用在 OpenAI 的 agent 上（跟其他六家分裂成兩套邏輯），要嘛得自己寫 adapter
  把七個 provider 橋接進它的 `Model` 介面——不管哪種都在增加整合成本，不是省下來。
- **最根本的問題**：不管是 LangGraph.js 還是 openai-agents-js，只要把它們當成
  `ctx.orchestrator` 本身，我們的 `task-graph` plugin 就只是一層薄薄的 wrapper，
  「可替換」這件事就名存實亡——換一個 orchestration 邏輯，變成要換掉底層框架，
  不是換一個 plugin。**真正的可替換性要靠我們自己定義的 `OrchestrationStrategy`
  介面撐住，不是靠採用了哪個框架。**

### 決策

**Phase 5 的 `task-graph` 策略自己寫**，不依賴 LangGraph.js 或 openai-agents-js。
`OrchestrationStrategy` 介面（ADR-0005 已定義）刻意設計成足夠通用，如果未來真的
需要 LangGraph 的循環/動態路由能力，或想借用 openai-agents-js 更成熟的沙盒執行
實作，屆時可以另外寫一個**新的策略 plugin**，內部包裝那些框架——那才是
「可替換」該有的用法：外部框架是介面**背後**的一種實作選擇，不是介面本身。

**唯一例外，且是 Phase 5 不做、留給之後的 `ctx.sandbox`（見 ADR-0006）**：
openai-agents-js 的 `UnixLocalSandboxClient`/`DockerSandboxClient`/雲端 provider
清單，之後可以考慮做成我們自己 `SandboxExecutor` 介面的其中一種實作——**前提是
先驗證過它在 macOS 上的實際隔離機制，且它從 beta 轉正式**，不是現在就依賴它。

## 問題 2：DAG 資料結構的具體 schema（細化 ADR-0005）

ADR-0005 已經決定要拆 Definition/Run 兩層，但沒把「nodes/edges 到底存成 JSON
還是正規化 table」講死。現在定案：

```
workflow_definitions(id, name, room_id, definition_json, created_at, updated_at)
  -- definition_json = { nodes: [{id, agentId, task}], edges: [{from, to}] }
  -- 整個 DAG 定義存一個 JSON 欄位，不拆成 task_nodes/task_edges 兩張表

workflow_runs(id, workflow_id, status, started_at, finished_at)

task_node_runs(id, run_id, node_id, agent_id, status, started_at, finished_at)
  -- 這張表維持正規化（不是 JSON），因為執行狀態需要逐筆更新/查詢

activity_log(id, workflow_run_id, task_node_run_id, agent_id, kind, target,
             started_at, finished_at, duration_ms, status, metadata)
```

**為什麼 definition 存 JSON、run 狀態存正規化 table：** UI 讀寫 workflow 定義
時，永遠是整包 nodes+edges 一起讀/一起寫（React Flow 這類圖編輯器的資料格式本來
就是 `{nodes, edges}` 一個 JSON 物件）——沒有「只查詢某個 workflow 裡的某一個
node」這種需求，正規化成兩張表反而要多做 join，沒有實際好處。但執行狀態
（`task_node_runs`）在跑的過程中會逐筆更新（這個 node 開始了、這個 node 完成
了），而且 `activity_log` 要能 join 回特定的 `task_node_run_id`，這種「頻繁單筆
讀寫 + 需要外鍵關聯」的情況才是正規化 table 該用的地方。

## Trade-off Analysis

**Pros：**
- 零新增依賴（不裝 LangGraph.js、openai-agents-js、sqlite-graph 任何一個），
  跟專案一貫的「Node 內建優先」原則一致。
- `ctx.orchestrator` 的可替換性建立在我們自己的介面上，是紮實的，不是名義上的。
- Schema 細化後，Phase 5 動手寫的時候不用再猜「JSON 還是正規化」，直接照上面的表寫。

**Cons：**
- 放棄了 LangGraph/openai-agents-js 現成的能力（重試邏輯、streaming、
  human-in-the-loop、resumable state）——這些之後如果真的需要，要自己刻或再重新
  評估要不要透過一個新策略 plugin 引入外部框架（YAGNI：真的需要再做，不要現在
  為了「以後可能需要」預先蓋）。
- `definition_json` 存 JSON blob，犧牲了一些 SQL 層級的查詢能力（例如沒辦法直接
  `WHERE` 查詢「哪些 workflow 裡有指定某個 agent 的 node」）——如果之後這種查詢
  真的變成需求，屆時可以另外加一張輔助的正規化索引表，不影響現在的設計。

## 影響

- ADR-0005 的整體方向不變，這份 ADR 只是把「怎麼實作」「DAG 怎麼存」兩個當時
  留白的細節定案。
- Phase 5 動手時，`workflow_definitions.definition_json` 的驗證（`validateAcyclic`
  等）在寫入資料庫之前，在應用層（`orchestrator/domain.ts` 的純函式）先做完，
  不依賴資料庫層的任何限制。
