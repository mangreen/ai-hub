# MEM: `Room.sandboxed` 改名 `Room.memoryIsolated`
Date: 2026-08-19
Tags: [naming, refactor, chat, storage]

## Summary
`Room.sandboxed`（Phase 2 引入）改名 `Room.memoryIsolated`，因為「sandbox」這個字
要留給新引入的執行隔離概念（`ctx.sandbox`，見 ADR-0006）。純 refactor，不改變任何
行為，82 個測試改完全過。

## Details

**改了什麼：**
- `chat/domain.ts`：`Room.sandboxed` → `Room.memoryIsolated`，`createRoom()` 的
  參數同步改名，`canAgentViewRoom()` 內部邏輯不變（只是讀的欄位名字換了）。
- `chat/domain.test.ts`：所有 test/describe 名稱、斷言裡的欄位名字一起改
  （例如 `should_allow_when_member_and_room_sandboxed` →
  `should_allow_when_member_and_room_memory_isolated`）。
- `chat/index.ts`：`createRoom()` 參數、`RoomRow` 介面、SQL 語句裡的欄位名字。
- `chat/index.test.ts`、`storage/index.test.ts`、`agent/domain.test.ts`：
  對應更新。
- `storage/index.ts`：SQL schema 的 `sandboxed INTEGER NOT NULL` →
  `memory_isolated INTEGER NOT NULL`。

**沒改什麼，為什麼：**
- `AgentVisibility.canPeek` 維持原名——它本來就沒用到「sandbox」這個字，語意
  現在看依然成立（能不能「偷看」被隔離的房間），不需要跟著動。
- 舊的 `memory/MEM-20260816-phase2-domain-and-testing.md` 保留原樣不改——那是
  Phase 2 當下的歷史紀錄，寫的就是「當時」的欄位名字，硬改反而失去歷史紀錄的
  意義。看到那份 MEM 裡還寫著 `room.sandboxed` 是正常的，不是沒改乾淨。

**操作上要注意（如果你本機已經跑過 `pnpm start` 產生過 `data/ai-hub.db`）：**
`StorageService` 的 schema migration 是 `CREATE TABLE IF NOT EXISTS`——只在
「表不存在」時建表，**不會**自動把舊表的 `sandboxed` 欄位改名成
`memory_isolated`。如果本機已經有舊的 `data/ai-hub.db`，新 code 讀寫會直接對
不上欄位名字而報錯。這個專案目前沒有正式的 migration 機制（用不到——`data/`
本來就在 `.gitignore`，沒有任何「正式資料」在裡面），**最簡單的處理方式是砍掉
本機的 `data/` 目錄重跑**，不需要寫一個只會用一次的 migration script。

## When to Use
之後如果又要幫某個欄位/概念取名字，先檢查會不會跟已經在規劃中的其他概念（就算
還沒實作）撞名——這次是先把「sandbox」用在小地方（chat 可見性），後來才發現
真正該用這個字的地方是執行隔離，撞名了才改名，成本比一開始想清楚術語版圖再命名
高一些，但也不嚴重（一次 grep + 8 個檔案就處理完，全部靠測試保護，沒有真的出錯）。
