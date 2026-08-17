# MEM: Registrations 改為 Cordis Effect（可逆註冊）
Date: 2026-08-16
Tags: [cordis, model, channel, skill-research]

## Summary
研究 DeepSeek Harness 的 `.agents/skills` 時，其 `AGENTS.md` 提到一條約定：
「Registrations are effects：所有註冊都要透過 `ctx.effect()`，`register()` 要回傳 disposer」。
檢查後發現 `ModelService`/`ChannelService` 的 `register()` 從 Phase 1 開始就沒有這個能力——
呼叫端沒辦法撤銷一筆註冊。現在補上，TDD 流程（先寫測試看紅燈）走過一次。

## Details
- `ctx.effect(execute: () => SyncEffect): Disposable<Promise<void>>`——`execute` 自己做註冊，
  回傳一個清理函式；`ctx.effect()` 回傳的東西呼叫下去，就會執行那個清理函式並回傳一個 Promise。
  這是實際查 `node_modules/cordis/lib/fiber.d.ts` 得到的簽章，不是憑印象猜的。
- **踩到一個坑**：探索用的最小重現範例把 service 命名成 `'registry'`、method 叫 `register()`，
  結果 `ctx.registry.register` 在消費端完全拿不到（`is not a function`），但换個名字
  （`'providers'` + `add()`）馬上正常。目前判斷是 `'registry'`這個 key 跟 Cordis 內部某個東西
  撞名，但没有在型別宣告檔案裡直接證實根因。**結論：service 命名避開 `registry`**（我們自己的
  五個 service 名稱 chat/agent/model/storage/channel 都沒有這個風險，純粹紀錄避雷）。
- `ModelService.register()` / `ChannelService.register()` 現在都回傳 disposer；`pnpm test`
  新增 10 個測試（model 6 個、channel 4 個）驗證註冊/重複註冊會 throw/dispose 後真的移除/
  dispose 後可以重新註冊同名。

## When to Use
Phase 3（model provider plugin）、Phase 8（channel adapter plugin）寫 `apply(ctx)` 時，
直接呼叫 `ctx.model.register(...)` / `ctx.channel.register(...)`，**不需要**手動存
disposer——Phase 3 實際驗證過：卸載呼叫端 plugin 自己的 fiber（`fiber.dispose()`）
就會自動連帶清掉它註冊的項目，不用自己接手管理生命週期（見
`memory/MEM-20260817-phase3-provider-research.md` 的驗證過程）。回傳的 disposer
只有在需要「不卸載整個 plugin、只是手動撤銷這一筆註冊」的情境才用得到（例如插件市場的
「停用」按鈕，Phase 7）。
