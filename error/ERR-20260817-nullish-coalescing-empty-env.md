# ERR: `??` 對「空字串」env var 不會 fallback，導致 `.env.example` 沒填也會壞
Date: 2026-08-17
Severity: Medium

## Description
`.env.example` 把新增的兩個選填變數留空（`AI_HUB_DB_PATH=`），`StorageService`
建構子原本寫 `process.env.AI_HUB_DB_PATH ?? './data/ai-hub.db'`。如果使用者
`cp .env.example .env` 之後沒填這兩行，`AI_HUB_DB_PATH` 會被設成**空字串**
`""`，不是 `undefined`——`??` 只在 `null`/`undefined` 時 fallback，空字串會直接
被當成 DB 路徑用，導致行為不對（甚至可能因為空路徑而炸掉）。

## Root Cause
Node 的 `--env-file`／`--env-file-if-exists` 解析 `KEY=`（等號後面沒東西）會把
`KEY` 設成空字串，不是「沒有這個變數」。`??`（nullish coalescing）的 fallback
條件是 `null`/`undefined`，不包含空字串，所以「使用者留空 = 沒填 = 應該用預設值」
這個直覺，跟 `??` 的實際行為對不上。

## Solution
把兩個路徑相關的 fallback 從 `??` 改成 `||`（`process.env.AI_HUB_DB_PATH ||
'./data/ai-hub.db'`）——`||` 對空字串也會 fallback，符合「留空 = 用預設值」
的實際需求。

## Prevention
- **任何「這個 env var 對應到 .env.example 裡一個可能被留空的選填欄位」的地方，
  預設值都要用 `||` 不是 `??`。** `??` 只適合「這個值真的可能是合法的 `0`／`false`／
  空字串，但那些都算數」的情境，env var 路徑類設定幾乎從來不是這種情境。
- 已知本專案目前唯一沒有這個風險的例外：provider plugin 裡的 `apiKey:
  process.env.X`（沒有 `?? defaultValue`），因為 `openai-compatible/client.ts`
  本來就用 `if (config.apiKey)` 這種 truthy check 加 header，空字串跟 `undefined`
  效果一樣（都不加 header），所以那邊不需要改。
