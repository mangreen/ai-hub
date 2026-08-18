# ADR-0004：持久化架構 — `node:sqlite` + Storage/Chat/Agent 的職責切分

Date: 2026-08-17
Status: Accepted

## 背景

Phase 4 要把 `ChatService`/`AgentService` 從空殼接上真的持久化。需要決定：
(1) 用什麼 SQLite driver，(2) schema 怎麼設計，(3) 「誰負責什麼」怎麼切。

## 決策 1：用 `node:sqlite`，不用 `better-sqlite3`

`better-sqlite3` 是 native addon（node-gyp 編譯），發行包含針對各平台/架構/Node ABI
版本預先編譯的 binary。這正是這個專案已經吃過兩次虧的那類風險——`tsx` 依賴的 `esbuild`
native binary 在 Big Sur 上直接 dyld 崩潰（見 `error/ERR-20260816-esbuild-bigsur-incompatible.md`）。
`node:sqlite` 是 **Node 自己內建的模組**（Node 22.5+ 起可用，目前仍標記
`ExperimentalWarning`，但功能可用，這個警告是預期中的，不是錯誤），編譯進 Node 執行檔本身，
不是另外裝的 native addon，跟這台開發機（2014 MacBook Pro / Big Sur）不會有相容性風險。

**在動手寫 `StorageService`之前，先寫最小重現腳本驗證了三件事**（不是憑印象假設 API）：
1. `DatabaseSync`、`.exec()`、`.prepare().run()/.get()/.all()` 都如預期運作。
2. `.run()` 回傳 `{ lastInsertRowid, changes }`。
3. UNIQUE / FOREIGN KEY 違反會直接 throw 一般 `Error`，訊息就是 SQLite 原始錯誤字串
   （例如 `UNIQUE constraint failed: rooms.id`），不是自訂的 error class。

## 決策 2：Schema 設計

```
rooms(id, name, sandboxed)
room_members(room_id, agent_id)   -- Room.memberIds 在 domain.ts 是陣列，SQL 用 join table 正規化
messages(id, room_id, sender_id, content, source_channel, created_at)
agents(id, name, model_ref, can_peek)
attachments(id, message_id, filename, mime_type, storage_path, size_bytes, created_at)
```

`source_channel` 對應 ADR-0002 的預留；`attachments.storage_path` 指向本地磁碟檔案
（Phase 4 範圍：先存本地，雲端儲存留給之後真的需要時再做，YAGNI）。

## 決策 3：職責切分（StorageService vs ChatService/AgentService）

**`StorageService`（infrastructure adapter）**：
- 擁有 SQLite connection、schema migration（`CREATE TABLE IF NOT EXISTS`，全部四張表
  一次建立，即使 `agents` 是 AgentService 的概念——所有 schema 集中一個地方管理，不散落各處）。
- 只暴露通用的 `run(sql, params)` / `get(sql, params)` / `all(sql, params)`——完全不知道
  「Room」「Message」是什麼，只是執行 SQL。
- `saveAttachment(messageId, filename, mimeType, data)`——寫檔案到本地磁碟 + 寫一筆
  `attachments` row。

**`ChatService`/`AgentService`（domain + application）**：
- 用 `./domain.ts` 的純函式做驗證（`createRoom`/`createMessage`/`createAgent`），
  用 `ctx.storage` 的通用方法做實際的讀寫，兩邊都不重複實作對方的邏輯。
- `static inject = ['storage']`——這是本專案第一次有 service 互相 inject，跟
  ADR-0001「Cordis service 邊界即分層」的決策一致：Storage 是一層，Chat/Agent 是另一層，
  分層之間用 inject 表達依賴方向。

這是標準的 repository pattern：`StorageService` 相當於 repository 的底層，
`ChatService`/`AgentService` 相當於 repository + 應用邏輯的合體（專案規模還小，
不需要為了教科書式的分層再多切一層）。

## Trade-off Analysis

**Pros：**
- 零額外 native 依賴，跟 Big Sur 相容性問題徹底絕緣。
- Schema 集中一處，之後要加欄位/加表，只有一個地方要改。
- `ChatService`/`AgentService` 的方法簽章維持跟 Phase 2 的 domain.ts 一致
  （`createRoom(id, name, sandboxed)` 等），Phase 2 寫的 27 個 domain 測試完全不用動。

**Cons：**
- `node:sqlite` 仍是 Node 官方標記的實驗性功能，未來 Node 版本可能改 API（風險已知，
  接受——這是目前最符合專案原則的選擇，好過馬上引入 native binary 風險）。
- `attachments.storage_path` 存的是本機路徑，這個設計在 Phase 8（外部 channel）接上後，
  要考慮如果之後真的搬到雲端儲存，這欄位的語意要跟著換（先不處理，YAGNI，真的要換的時候
  再改一次 migration）。

## 影響

- `.gitignore` 新增 `data/`——SQLite 檔案跟附件不該進版控。
- `AI_HUB_DB_PATH`／`AI_HUB_ATTACHMENTS_DIR` 兩個環境變數控制路徑，預設值
  （`./data/ai-hub.db`、`./data/attachments`）不需要使用者手動設定就能跑，
  測試用 `:memory:` 覆蓋。
