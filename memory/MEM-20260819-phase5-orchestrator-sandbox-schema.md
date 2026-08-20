# MEM: Phase 5 第一塊 — `ctx.orchestrator`/`ctx.sandbox` registry + workflow schema
Date: 2026-08-19
Tags: [orchestrator, sandbox, workflow, kahn-algorithm]

## Summary
照 ADR-0005 自己的承諾（「動手時可能要再拆成更小的可執行單元」）把 Phase 5 拆成兩塊，
這次做完第一塊：兩個新 registry service + 四張新表 + DAG 驗證純函式。113 個測試全過
（82 舊的 + 31 新的：orchestrator/domain.ts 16、orchestrator/index.ts 5、
sandbox/index.ts 6、storage 新測試 4）。`task-graph` 預設策略（真正執行 workflow 的
邏輯）留給下一輪。

## Details

**`validateAcyclic` 用 Kahn's algorithm，不是 DFS 三色標記：** 兩種都能偵測環，選
Kahn's 是因為它同時計算「拓撲順序」（下一輪寫 `task-graph` 策略、需要決定 node 執行
順序時會直接用到，現在雖然只丟棄結果只留驗證，但演算法本身已經是對的，不用之後重寫）。
實作方式：每個 node 算入度（有幾條邊指向它），入度 0 的先進 queue，處理一個 node 就
把它所有出邊指向的 node 入度減一，減到 0 就進 queue；如果最後訪問過的 node 數量不等於
總數，代表有些 node 卡住出不來——就是環。9 個測試涵蓋：無邊、直線鏈、菱形（多條路徑
匯聚，驗證不會誤判成環）、兩點環、三點環、自環、邊指向不存在的 node（兩個方向都測）、
重複 node id。

**`ctx.orchestrator`/`ctx.sandbox` 完全照抄 `ModelService` 的 registry 寫法**——
`register()` 用 `ctx.effect()`，不用手動存 disposer（Phase 3 已經驗證過 fiber 卸載會
自動連帶清乾淨，見 MEM-20260817-phase3-provider-research.md）。這是這個 pattern
第三、四次被使用，沒有再另外驗證一次 API 行為，直接照抄。

**`WorkflowDefinition.nodes`/`.edges` 現在還沒有 Cordis service 使用它們**——
`orchestrator/domain.ts` 目前是純函式庫，沒有任何 Service 呼叫 `createWorkflowDefinition`。
這是刻意的：`ChatService`/`AgentService` 在 Phase 4 才把 domain.ts 接上持久化，
這次只做到 domain.ts 本身，「哪個 Service 該負責建立/儲存 WorkflowDefinition」
（是 `OrchestratorService` 自己，還是靠 `task-graph` 策略 plugin）留到寫策略的時候
一起決定——現在硬決定太早，兩種做法目前看不出明顯優劣。

**`activity_log` 的五個索引都測試過真的存在**（不是只測「schema 沒報錯」）：
用 `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'activity_log'`
逐一比對五個索引名稱都在裡面，比單純「跑得動」更嚴謹。

**Kernel bootstrap 的順序沒有特別講究**——`ctx.plugin(OrchestratorService)`/
`ctx.plugin(SandboxService)` 放在哪裡都一樣，因為 Phase 4 已經驗證過 Cordis 的
`static inject` 跟掛載順序無關（見 MEM-20260817-phase4-storage-and-static-inject.md）。

## When to Use
下一輪寫 `task-graph` 策略時：
- 需要拓撲順序的地方，把 `validateAcyclic` 的內部邏輯抽出一個
  `topologicalOrder(nodes, edges): string[]` 函式（現在的 `validateAcyclic` 內部
  已經在算這個，只是丟棄了）——不要重新設計演算法。
- `activity_log` 寫入時，`metadata` 欄位只放「發生了什麼」的摘要，不要把
  `ctx.model.complete()` 的完整 request/response 塞進去（ADR-0005/0006 都提過這條
  guardrail，這裡再次強調，因為這是第一次真的有程式碼會寫入這張表）。
