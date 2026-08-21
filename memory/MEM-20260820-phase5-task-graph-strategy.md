# MEM: Phase 5 第二塊 — `task-graph` 策略、事件真正 emit、null-prototype 測試坑
Date: 2026-08-20
Tags: [orchestrator, task-graph, events, node-sqlite]

## Summary
完成 Phase 5 剩下的部分：`task-graph` 預設策略（真正執行 workflow 的邏輯）、
`parseModelRef`（拆解 `Agent.modelRef`）、`ChatService.postMessage` 真正 emit
`'chat/message'`。135 個測試全過（113 舊的 + 22 新的）。

## Details

**`topologicalOrder` 從 `validateAcyclic` 抽出來，不是重寫：** 上一輪的 MEM
（MEM-20260819-phase5-orchestrator-sandbox-schema.md）已經預告這件事——`validateAcyclic`
內部的 Kahn's algorithm 本來就在算執行順序，只是丟棄了。這次把共用邏輯抽成私有的
`kahnOrder()`，`validateAcyclic`/`topologicalOrder` 都是它的薄 wrapper。用 TDD 驗證：
先幫 `topologicalOrder` 寫測試（包含「輸入順序打亂、輸出順序照依賴關係排」跟「兩個
獨立分支匯聚到同一個 node」兩個案例），看紅燈，重構，看綠燈，確認舊的 20 個
`validateAcyclic` 測試沒壞。

**`parseModelRef` 只切第一個冒號，不是全部：** 真實的 OpenRouter 模型名稱本身就帶
冒號（例如 `nvidia/nemotron-3-ultra-550b-a55b:free`，來自 `.tmp/test-openrouter.ts`
那次手動測試），如果用 `split(':')` 切全部，會把 provider 名字以外的部分切爛。用
`indexOf(':')` 找第一個位置、`slice()` 兩段，確保「provider」永遠只有第一段，
「model」是剩下的全部（就算裡面還有冒號）。

**`OrchestratorService` 身兼兩職——策略 registry + WorkflowDefinition 持久化——是
上一輪故意留白的決定，這次拍板：** 沒有第三個 service 自然適合擁有
`WorkflowDefinition` CRUD，硬拆成獨立 service 對這個專案規模是過度設計。
`createWorkflow`/`getWorkflow`/`run` 三個方法都需要 `ctx.storage`，所以
`OrchestratorService` 現在也 `static inject = ['storage']`（第三個這樣做的
service，前兩個是 Phase 4 的 `ChatService`/`AgentService`）。

**`'chat/message'` 事件的 emit 位置：故意放在 `ChatService.postMessage()` 內部，
不是 `task-graph` 策略呼叫完 `postMessage` 後自己另外 emit。** 原因：`postMessage`
是所有訊息（不管來自 Web UI、Agent、還是未來的外部 channel）的唯一進入點，事件應該
在那個進入點自動觸發，不該要求每個呼叫端都記得自己 emit 一次——不然以後只要有人
忘記 emit，這個事件就會漏掉。改這裡順便補了一個新測試
`should_emit_chat_message_event_when_message_posted`，是繼 Phase 1 保留這個事件
之後，第一次真的驗證它會被觸發。

**`task-graph` 目前是 sequential fail-fast，不平行執行獨立分支：** 「Allen 寫前端」
「Ben 寫後端」這兩個 node 之間沒有邊，理論上可以平行跑，但這次選擇還是照拓撲順序
一個一個跑。這是刻意的簡化（YAGNI）：平行執行要處理 `activity_log`/`task_node_runs`
的並發寫入、還有「多個 node 同時失敗要怎麼回報」的邏輯，這些複雜度現在換不到實際
好處（範例本身跑起來很快，沒有效能問題）。程式碼裡的註解直接寫了「如果之後真的因為
workflow 跑太慢變成問題，再回頭做」。

**踩到一個測試層級的坑，不是實作的 bug：** `node:sqlite` 的 `.get()`/`.all()`
回傳 null-prototype 物件（`[Object: null prototype] {...}`），用
`node:assert/strict` 的 `deepEqual`（也就是 `deepStrictEqual`）直接比對會因為
prototype 不同而判定不相等，即使所有欄位值都一樣。修法是比對前先
`rows.map(r => ({...r}))` 轉成 plain object，不是去改 `StorageService`
的實作——`node:sqlite` 回傳 null-prototype 是它自己的正常行為，不需要也不應該
在我們的 code 裡特別處理，只有「測試裡拿它跟字面量物件比對」這個情境會撞到。

## When to Use
之後任何測試要用 `assert.deepEqual`/`assert.deepStrictEqual` 比對
`ctx.storage.get()`/`.all()` 的回傳值跟一個字面量物件時，記得先 spread 成 plain
object，不然會遇到一樣的 prototype 不匹配錯誤。
