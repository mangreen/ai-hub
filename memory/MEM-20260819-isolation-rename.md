# MEM: `Room.memoryIsolated` 改名 `Room.isolated`（第二次改名，修正過度限定的名字）
Date: 2026-08-19
Tags: [naming, refactor, chat]

## Summary
`Room.memoryIsolated`（見 `MEM-20260819-memory-isolation-rename.md`，同一天稍早才從
`sandboxed` 改過來）再改一次，變成 `Room.isolated`。理由：`memoryIsolated` 太長，而且
「memory」這個字把範圍講窄了——這個欄位隔離的不只是對話記憶，還包括附件、上下文，
未來也會包括掛在房間上的 skill/prompt 設定。完整命名史：`sandboxed`（Phase 2-4）→
`memoryIsolated`（2026-08-19 上午）→ `isolated`（2026-08-19 下午，這次）。

## Details

**改了什麼（跟第一次改名範圍一樣，只是把 `memoryIsolated`/`memory_isolated` 換成
`isolated`）：**
- `chat/domain.ts`：`Room.memoryIsolated` → `Room.isolated`，`createRoom()` 參數、
  JSDoc 同步更新（JSDoc 特別寫清楚為什麼不叫 `memoryIsolated`：這個欄位管的是「房間
  對外的整體可見性」，不是狹義的對話記憶）。
- `chat/domain.test.ts`、`chat/index.ts`（含 SQL 欄位 `memory_isolated` →
  `isolated`）、`chat/index.test.ts`、`storage/index.ts`（schema）、
  `storage/index.test.ts`：同步更新，82 個測試全過。
- `CLAUDE.md`、`README.md`、`docs/adr/ADR-0004-storage-architecture.md`、
  `docs/adr/ADR-0006-execution-sandbox-plugin.md`、
  `docs/architecture/system-architecture.md`：文字說明同步更新。

**為什麼不是第一次就叫 `isolated`：** 第一次改名時的重點是「跟新的 `ctx.sandbox`
執行隔離概念分開」，选了一個看起来更明確的名字 `memoryIsolated`；沒想清楚這個
欄位實際涵蓋的範圍比「記憶」更廣。這次是先有更完整的認知（涵蓋附件/上下文/未來的
skill 設定）才發現 `memoryIsolated` 本身也定義過窄，改成更中性、範圍更大的
`isolated`。

**操作上的提醒跟第一次一樣：** 如果本機已經有舊的 `data/ai-hub.db`（不管是
`sandboxed` 還是 `memoryIsolated` 版本的 schema），`CREATE TABLE IF NOT EXISTS`
都不會自動遷移欄位名字，直接砍掉 `data/` 目錄重跑最簡單。

## When to Use
未來要幫「一個欄位涵蓋的範圍」取名字時，先想清楚這個欄位實際上要管到多廣，
不要因為當下最容易想到的例子（例如「對話記憶」）就把名字取窄了——這次多花一次
改名的成本換來的教訓。
