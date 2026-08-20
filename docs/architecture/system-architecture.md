# AI Hub 系統架構圖

> 這份圖用 [Mermaid](https://mermaid.js.org/) 畫（GitHub / VS Code / 大多數 Markdown 檢視器都能直接
> 渲染），語法在寫入前已用 `mermaid.parse()` 實際驗證過，不是手畫 ASCII 對齊猜的。

「DONE」= 已實作。「規劃中」= 尚未實作，標註對應 Phase。

```mermaid
flowchart TD
    subgraph Clients["使用者 / 外部世界"]
        WebUI["Web UI<br/>React + Vite<br/>Phase 6 規劃中"]
        Channels["外部聊天平台<br/>WhatsApp / Messenger / 企業微信<br/>Phase 8 規劃中 · ADR-0002"]
    end

    subgraph APILayer["API 層"]
        ctxapi["ctx.api — HTTP router<br/>Phase 6 規劃中"]
    end

    subgraph Kernel["Cordis Plugin Kernel — 已實作 Phase 0-2"]
        chat["ctx.chat<br/>Room / Message domain<br/>DONE"]
        agent["ctx.agent<br/>Agent / TaskAssignment domain<br/>DONE"]
        model["ctx.model<br/>registry, effect-based<br/>DONE"]
        storage["ctx.storage<br/>SQLite (node:sqlite)<br/>DONE"]
        channel["ctx.channel<br/>registry, effect-based<br/>DONE"]
    end

    subgraph ModelProviders["Model Provider 插件 — Phase 3 規劃中"]
        ollama["Ollama 本地"]
        openai["OpenAI-相容<br/>Claude/GPT/Gemini/Grok"]
        nvidia["NVIDIA build API"]
    end

    subgraph ChannelAdapters["Channel Adapter 插件 — Phase 8 規劃中"]
        whatsapp["WhatsApp Cloud API"]
        messenger["Messenger Platform"]
        wecom["企業微信自建應用"]
    end

    subgraph StorageImpl["Storage — Phase 4 DONE"]
        sqlite["SQLite<br/>node:sqlite, built-in"]
        attachments["附件檔案<br/>本地磁碟"]
    end

    subgraph Marketplace["插件市場 — Phase 7 規劃中"]
        mp["ctx.marketplace<br/>執行期動態安裝/啟停"]
    end

    WebUI -->|"REST/WebSocket"| ctxapi
    Channels -->|"Webhook 收 / REST API 送"| ctxapi
    ctxapi --> chat
    ctxapi --> agent

    model -->|register| ollama
    model -->|register| openai
    model -->|register| nvidia

    channel -->|register| whatsapp
    channel -->|register| messenger
    channel -->|register| wecom

    storage --> sqlite
    storage --> attachments

    agent -.->|assignTask 用到| model
    chat -.->|canAgentViewRoom 檢查| agent

    Marketplace -.->|可管理任何 ctx 底下的 plugin| Kernel
```

## 圖例對照表

| 元件 | 狀態 | 對應 Phase | 原始碼位置 |
|---|---|---|---|
| `ctx.chat` | 已實作 | Phase 1（骨架）+ Phase 2（domain） | `src/plugins/chat/` |
| `ctx.agent` | 已實作 | Phase 1（骨架）+ Phase 2（domain） | `src/plugins/agent/` |
| `ctx.model` | 已實作（registry 可用，effect-based） | Phase 1 | `src/plugins/model/` |
| `ctx.storage` | 已實作 | Phase 1 骨架 + Phase 4 SQLite 實作 | `src/plugins/storage/` |
| `ctx.channel` | 已實作（registry 可用，effect-based） | Phase 1，見 ADR-0002 | `src/plugins/channel/` |
| Model provider 插件 | 規劃中 | Phase 3 | `src/plugins/model/{ollama,openai-compatible}/` |
| Channel adapter 插件 | 規劃中 | Phase 8 | `src/plugins/channel/{whatsapp,messenger,wecom}/` |
| API 層 / Web UI | 規劃中 | Phase 6 | `src/web/` |
| 插件市場 | 規劃中 | Phase 7 | `src/plugins/marketplace/` |

## 資料流重點

1. **訊息永遠先經過 `ctx.chat`**，不論來源是 Web UI、Agent 自己發的、還是外部 channel
   webhook 轉進來的——這是 `Message.sourceChannel` 欄位存在的原因（見 ADR-0002）。
2. **`ctx.model` / `ctx.channel` 是純 registry**，本身不認識任何一家平台；認識平台細節的是
   各自的 provider/adapter 插件，插件在自己的 `apply(ctx)` 呼叫 `ctx.model.register(...)`
   把自己註冊進去，並保留回傳的 disposer（見 `memory/MEM-20260816-registrations-as-effects.md`）。
   Kernel 完全不用改就能加新平台——這是「萬物皆插件」在這個專案裡的具體落地。
3. **`ctx.api`（Phase 6）是唯一同時被 Web UI 和外部 channel webhook 觸碰的入口**，兩種來源的
   請求最終都會落到同一套 `ctx.chat`/`ctx.agent` 邏輯，不會有兩套平行的訊息處理路徑。

另見 [`cordis-dependency-graph.md`](./cordis-dependency-graph.md)——上面這張圖是「產品功能」視角，
那張圖是「Cordis plugin/inject 機制」視角，兩張圖對應同一套程式碼，但回答不同的問題。
