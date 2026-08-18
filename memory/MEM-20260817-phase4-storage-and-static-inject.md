# MEM: Phase 4 — node:sqlite 驗證 + Service 的 static inject
Date: 2026-08-17
Tags: [storage, sqlite, cordis, static-inject]

## Summary
動手寫 `StorageService` 之前，先驗證了 `node:sqlite` 的實際 API（不是憑印象）；
動手寫 `ChatService`/`AgentService` 之前，先驗證了 Cordis 的 Service class 用
`static inject` 宣告依賴、且會正確處理掛載順序（即使呼叫端先於被依賴的 service 掛載）。

## Details

**`node:sqlite` 驗證過的行為：**
- `new DatabaseSync(path)`、`.exec(sql)`（跑 DDL）、`.prepare(sql).run(...params)` /
  `.get(...params)` / `.all(...params)`，全部用 `?` 位置參數綁定，跟預期一致。
- `.run()` 回傳 `{ lastInsertRowid, changes }`。
- constraint 違反（UNIQUE、FOREIGN KEY）直接 throw 一般 `Error`，`message` 就是
  SQLite 原始錯誤字串（`UNIQUE constraint failed: rooms.id`）——沒有專屬 error class，
  所以 `StorageService` 的 `run()` 沒有特別 wrap 這些錯誤，讓它們原樣往外拋。
- 執行時會印一次 `ExperimentalWarning: SQLite is an experimental feature`——這是
  Node 自己的警告，不是我們的 bug，不用處理，只需要知道這是預期行為。
- 實際測過**真的檔案路徑**（不是只測 `:memory:`）：`./data/ai-hub.db` 會自動建立
  （包括父目錄），重複開機不會因為「表已存在」或任何殘留資料而炸掉（`CREATE TABLE
  IF NOT EXISTS`，而且 kernel 開機本身不寫入任何示範資料）。

**Service 的 `static inject`：** 寫了一個最小重現（`Dep`/`Consumer` 兩個 Service，
`Consumer` 用 `static inject = ['dep']`，**故意**用 `ctx.plugin(Consumer)` 在
`ctx.plugin(Dep)` **之前**掛載）——結果 `Consumer` 的建構還是正確延後到 `Dep`
可用之後才執行，`this.ctx.dep` 在建構完成當下就已經可以呼叫。這跟 function/object
形式 plugin 的 `export const inject = [...]` 效果一樣，只是 Service class 用的是
**靜態屬性**，不是模組層級的 `export const`。

## When to Use
之後任何一個 Service 需要依賴別的 service（例如 Phase 5 的 `AgentService` 真的需要
`ctx.model` 去查 provider 執行任務時），照這個模式加 `static inject = ['model']`，
不用擔心 `ctx.plugin()` 呼叫順序——Cordis 會處理。schema 變動時，改
`src/plugins/storage/index.ts` 裡的 `SCHEMA_SQL` 常數（一個地方管全部四張表），
不要把 `CREATE TABLE` 語句散落到 ChatService/AgentService 裡。
