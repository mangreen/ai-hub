# ADR-0002：預留多通訊平台閘道（WhatsApp / Messenger / WeChat）

Date: 2026-08-16
Status: Accepted（設計預留，實作延後到 Phase 8）

## 背景

需求：使用者可以直接從 WhatsApp / Messenger / WeChat 發送任務訊息給某個 Agent，
並在原本的聊天軟體裡收到狀態回報，而不用打開 AI Hub 自己的介面。

這屬於 Section 5（Graph/DAG Dependency Management）講的「會影響 Domain 層的決策」——
外部身分（一個 WhatsApp 號碼 / Messenger PSID / 企業微信 userid）要如何對應到內部的
Room/Agent，這件事現在不決定，Phase 2 設計 Room/Message 時就會設計錯，之後要花更大力氣改。
所以**現在先把介面邊界跟資料模型的位置定下來，實際三個平台的 adapter 實作延後到 Phase 8**。

## 三個平台的實際限制（2026-08-16 查證，非憑印象）

| 平台 | 官方管道 | 收發模式 | 主要限制 |
|---|---|---|---|
| **WhatsApp** | Cloud API（Meta 官方託管） | Webhook 收（`entry[].changes[].value.messages[]`）+ Graph API REST 送 | 需 Meta 商業驗證（約需 3–5 個工作天）；新帳號 Tier 1 只能對 1000 個不重複聯絡人/24h；**超過客服時間窗口只能用預先審核過的 Template 訊息**主動發起對話 |
| **Messenger** | Messenger Platform（Meta 官方） | 同樣的 Webhook 收 + Send API (`/PAGE-ID/messages`) 送 | 24 小時訊息窗口；窗口外要用 Message Tag，但 Tag 濫用會被限制發送權限，且部分 Tag（如 `CONFIRMED_EVENT_UPDATE`）已於 2026/4/27 起被官方擋掉 |
| **WeChat（個人號）** | **沒有官方 server-side 發送 API** | 非官方方案（Hook 注入 PC 端、協定逆向模擬、第三方託管 API）| **有封號風險**，2026 年的社群共識是 Hook 注入/UI 自動化已不建議作為正式方案；不合規、不穩定，本專案預設不支援 |
| **WeChat（企業微信）** | 企業微信自建應用 | 官方 OAuth2.0 + callback URL（可收可送）| 這是唯一**官方、雙向、合規**的微信路徑；個人也可以免費申請企業微信做內部測試用途，不需要真的是公司 |

**決策：** 「WeChat」統一指「企業微信自建應用」，不做個人微信自動化。這件事要在需求文件跟未來的 UI 文案上寫清楚，
避免使用者以為可以連自己的個人 WeChat 帳號。

## 決策：新增 `ctx.channel` 作為第五個 service 類別

跟 `ctx.model`（模型 provider 的 registry）對稱，`ctx.channel` 是**通訊平台 adapter 的 registry**：

```ts
interface ChannelAdapter {
  name: string
  sendMessage(externalTarget: string, content: ChannelMessageContent): Promise<void>
  // 各 adapter 自己在 Phase 8 決定要怎麼註冊 webhook route（透過未來的 ctx.api service）
}
```

- 每個平台（WhatsApp/Messenger/WeCom）Phase 8 各寫一個 plugin，`inject: ['channel']`，
  呼叫 `ctx.channel.register(adapter)`。
- Adapter 收到外部訊息時，統一 emit **`channel/message-received`** 事件
  （payload 包含 `channel` 名稱 + 外部使用者 id + 內容），下游的 Agent 協作邏輯
  完全不需要知道訊息是從哪個平台來的——這就是 Phase 0 示範過的 event-based 解耦
  （原始範例已刪除，見 git branch `phase/0-environment-cordis-basics`），在這裡真正派上用場。

## 對 Phase 2（Domain 層）的預留（現在只記錄，不現在做）

Room/Agent 需要能夠關聯到 0 或多個外部身分：

```
ExternalIdentity {
  channel: 'whatsapp' | 'messenger' | 'wecom'
  externalUserId: string   // wa_id / PSID / WeCom userid
  roomId: string           // 對應到哪個內部 Room
}
```

Phase 2 設計 Room/Message entity 時，訊息來源要能標記「這則訊息是從哪個 channel 進來的」，
不要假設所有訊息都來自 AI Hub 自己的 Web UI。

## Trade-off Analysis

**Pros：**
- 現在只花很小的成本（一個空 registry service + 一個資料模型欄位的預留），
  換到之後不用回頭改 Domain 層。
- `ctx.channel` 跟 `ctx.model` 用同一套 registry pattern，學習成本低，不用發明新概念。

**Cons：**
- 三個平台都需要**公開可連的 HTTPS 網址**才能收 webhook——你目前在家用 Mac 開發，
  屆時（Phase 8）需要 ngrok / Cloudflare Tunnel 之類的工具，這是額外的環境設定，先记录、不現在處理。
- WhatsApp/Messenger 都要走 Meta 商業驗證流程，不是純技術問題，有審核等待時間，
  真正接上外部平台那天要提早規劃時間，不能臨時抱佛腳。

## 影響
- `src/plugins/channel/` 目錄現在建立（空殼），實作留到 Phase 8。
- Phase 4（storage）之後，附件的儲存格式要能對應到三個平台各自的媒體上傳方式
  （WhatsApp 是先上傳拿 `media_id` 再引用），這件事到 Phase 8 再處理，Phase 4 先不用管。
