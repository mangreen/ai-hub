# MEM: Phase 1 — Service 邊界與 Registry Pattern
Date: 2026-08-16
Tags: [kernel, cordis, service-design, channel-gateway]

## Summary
五個 Cordis Service（chat/agent/model/storage/channel）已建立邊界；`model`/`channel` 用 registry
pattern（`register/get/list`），其餘先留空殼；新增 `ctx.channel` 是為了預留 Phase 8 的
WhatsApp/Messenger/企業微信整合（見 `docs/adr/ADR-0002-channel-gateway.md`）。

## Details
- Registry pattern：`ModelService`/`ChannelService` 內部用 `Map<string, T>`，暴露
  `register(item)`（重複註冊會 throw）、`get(name)`、`list()`。之後 Phase 3 的每個模型 provider
  plugin、Phase 8 的每個 channel adapter plugin，都是呼叫這個 `register`，而不是把平台知識寫死在
  kernel 裡——這才是真正落實「萬物皆插件」的地方，不是只把程式碼拆檔案而已。
- Cordis rc.8 的核心**沒有** `ready`/`dispose` 這種高階生命週期事件（實際查過 `events.d.ts`，
  只有 `internal/*` 開頭的低階事件）。要確認「所有 service 都掛載完成」，正確做法是用 `inject`
  宣告依賴，讓 Cordis 保證載入順序，而不是猜一個可能不存在的事件名字。
  （這也是為什麼 `src/index.ts` 最後用一個 `{ name: 'phase1-boot-check', inject: [...] }` 的
  object-form plugin，而不是 `ctx.on('ready', ...)`。）
- Phase 0 的示範 plugin（`greeter.ts`/`consumer.ts`/`event-demo.ts`）還在，但**不再掛載進
  `src/index.ts`**，純粹留著當學習參考（README 有連結）。

## When to Use
Phase 3、Phase 8 寫新的 provider/adapter plugin 時，照這個 registry pattern：
plugin 用 `inject: ['model']`（或 `['channel']`），`apply(ctx)` 裡呼叫
`ctx.model.register({ name: '...', ... })`。
