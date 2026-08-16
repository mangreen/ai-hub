# AI Hub — Multi-Agent Chat Platform
## 專案憲章 + 分階段學習開發路線圖（v1.0-lite，改編自 AI Loop/Graph Engineering Prompt v3.0）

> 本檔案取代原始 v3.0 規範，作為此專案實際使用的 `CLAUDE.md`。
> 精簡原則：v3.0 是為「多人 Staff Engineer 團隊 + 正式 CI/CD」設計的規範，
> 這裡是「單人學習型專案 + 2014 年 MacBook Pro」，所以我們保留**精神**（安全、可測試、
> 有紀錄），砍掉**團隊規模才需要的重量級流程**（強制 80% 覆蓋率 CI gate、K6 大型壓測、
> Testcontainers 真實 DB 容器）。

---

## 0. 環境現況與限制（來自你的系統資訊）

| 項目 | 數值 | 對開發的影響 |
|---|---|---|
| 機型 | MacBook Pro 13" (Retina, Mid 2014) | 無獨立 GPU，僅 Intel Iris 內顯 1536MB |
| OS | macOS Big Sur 11.7.11 | 新版 Docker Desktop 不支援；需用 Colima / OrbStack，或延後導入 Docker |
| CPU | 3GHz 雙核心 i7 | Ollama 只能 CPU 推理，多 Agent 同時本地推論會很吃力 |
| RAM | 16GB | 夠開發用，但同時跑多個本地模型 + IDE + 瀏覽器會吃緊 |

**具體建議：**
- Ollama 本地模型鎖定 **3B–8B 量化版（q4_K_M）**，不要嘗試 14B+；本地模型定位是「開發期測試 / 免費 fallback」，不是主力。
- 主力模型走 **API**（Claude / GPT / Gemini / Grok / NVIDIA build API），本地機器只負責跑 Node 服務本身。
- 資料庫先用 **SQLite（better-sqlite3）**，不依賴 Docker；Docker 只在 Phase 8（CI/壓測）才需要，屆時用 Colima 而非 Docker Desktop。

---

## 1. 架構基礎：為什麼是 Cordis，而不是直接 fork DeepSeek Harness

- **Cordis**：穩定的 TypeScript plugin meta-framework，已支撐 Koishi 專案多年。核心概念：
  - `Context` = service 註冊表，plugin 透過 `ctx.<service>` 取用能力，而非直接 import 實作。
  - plugin 兩種寫法：`function(ctx) {...}`（可加 `inject` 宣告依賴）或 `class extends Service`。
  - 掛載/卸載是**可逆的**（effect 會自動 rollback），適合「聊天室動態開關某個 Agent 插件」這種需求。
  - Typed Events：`emit`（廣播）、`waterfall`（依序改寫結果）、`parallel`/`serial`（依序或平行執行 listener）。
- **DeepSeek Harness (dsh)**：一個「Everything is a plugin」的完整 Agent Harness 產品，2026/8/13 才公開 dev preview，架構仍在劇烈變動。它是**很好的架構參考**（怎麼把 model adapter、tool、session、sandbox 都拆成 Cordis service），但**不建議 fork 或 vendor**，因為隨時可能 breaking change。

**決策：** 專案直接 `npm install cordis` 作為 kernel 依賴；把 dsh 的 `docs/cordis-tutorial`、`docs/architecture.md` 當教材讀，自己動手重建一個「精簡版」，這樣你才真的學到東西，而不是搬一坨看不懂的程式碼。

---

## 2. 精簡版工程規範（相對原 v3.0 的取捨表）

| 項目 | v3.0 原規範 | AI Hub 精簡版 | 為什麼調整 |
|---|---|---|---|
| 架構分層 | 嚴格 Hexagonal + DDD 資料夾 | Cordis service 邊界即分層（`ctx.chat` / `ctx.agent` / `ctx.model` / `ctx.storage`） | Cordis 本身就是一種輕量 hexagonal，不需要再疊一層資料夾規則 |
| TDD | 所有功能 Red-Green-Refactor | Domain 邏輯（Agent 分配、sandbox 可見性規則）**必須**先寫測試；UI/黏合層可以先跑起來再補測試 | 單人開發，UI 反覆試錯階段寫測試效益低 |
| 覆蓋率 Gate | CI 強制 80% 否則擋 merge | 目標 60–70%（僅 domain/application 層），先用 `vitest --coverage` 看趨勢，不設 CI 硬擋 | 沒有團隊審查壓力，硬 gate 只會拖慢學習節奏 |
| 整合測試環境 | Testcontainers 真實 DB | SQLite in-memory（`:memory:`）即可，Docker 留到 Phase 8 | 避開 Big Sur 上 Docker Desktop 相容性問題 |
| 壓測 | K6 / Autocannon 正式壓測 | 延後到 Phase 8，用 Autocannon（比 K6 輕、免額外安裝） | 機器效能有限，先求功能正確 |
| 機密管理（4.3 節） | 完整規則 | **完全保留，不砍** | 這是唯一「多人/單人都一樣重要」的規則——一旦洩漏 API key 沒有例外 |
| Git 流程 | 每個 TDD cycle commit | 保留：每階段開一個 `phase/N-主題` branch，完成後 merge 回 main + 打 tag | 符合你原本非功能需求「每個階段開新 branch」 |
| 文件（MEM/ERR/SKILL/ADR） | 全套維護 | 保留但簡化：每階段結束寫 1 篇 MEM（決策）+ 有錯誤才寫 ERR，不強制每個小決定都建檔 | 過度建檔對單人專案是負擔，抓大放小 |
| Coverage/Secrets CI 掃描 | GitHub Actions 全套 | 保留 **Gitleaks**（機密掃描，成本低效益高）；lint + unit test 也上 CI；覆蓋率/壓測 CI 留到 Phase 8 | 分階段導入 CI，避免一開始就卡在 pipeline 設定 |

---

## 3. 目錄結構（Cordis 化版本）

```
ai-hub/
├── CLAUDE.md                 # 本檔案
├── README.md
├── CHANGELOG.md
├── todo.md
├── memory/                   # MEM-YYYYMMDD-topic.md
├── error/                    # ERR-YYYYMMDD-brief.md
├── docs/
│   ├── architecture/         # Mermaid 架構圖，每階段更新一次
│   └── adr/                  # 重大技術決策紀錄
├── cordis.yml                # Cordis 應用組裝設定
├── src/
│   ├── plugins/
│   │   ├── chat/              # 聊天室/訊息/sandbox 可見性 service
│   │   ├── agent/             # Agent 定義、任務指派、多 Agent 協作 loop
│   │   ├── model/              # 各家模型 provider（下面拆一層）
│   │   │   ├── ollama/
│   │   │   ├── openai-compatible/   # Claude / GPT / Gemini / Grok / NVIDIA build 共用介面
│   │   ├── storage/            # SQLite + 附件檔案儲存
│   │   ├── channel/            # 外部通訊平台 adapter（whatsapp/messenger/wecom，Phase 8）
│   │   └── marketplace/        # 插件市場：manifest、動態啟停
│   └── web/                   # React/Vite 前端
└── .github/workflows/         # CI（分階段擴充）
```

---

## 4. 開發階段（每階段結束：merge branch → 更新 CHANGELOG/todo.md → 寫 1 篇 MEM → 更新架構圖 → 跟你確認後才進下一階段）

### Phase 0 — 環境與 Cordis 基礎 ✅ 完成（2026-08-16，`phase-0-complete` tag）
**學習重點：** 讀完 dsh 的 `cordis-tutorial`（01-first-plugin → 03-services），理解 plugin / service / inject / event。
**交付物：** pnpm monorepo 骨架、一個「hello plugin」跑起來、git 分支流程測試一輪。
**實際結果跟原計畫的差異：** 沒有用 `cordis.yml` + loader（延後到真的需要 config-driven 載入時再考慮，KISS）；
`tsx` 因為 esbuild native binary 不支援 Big Sur 被整個移除，改用 Node 內建 TypeScript type-stripping
（`node src/index.ts`，不用任何編譯/轉譯工具）。細節見 `error/ERR-20260816-*.md`。

### Phase 1 — Plugin Kernel 骨架 ✅ 完成（2026-08-16）
**學習重點：** 設計 service 邊界（`ctx.chat` / `ctx.agent` / `ctx.model` / `ctx.storage` / `ctx.channel` 各自該暴露什麼介面）。
**交付物：** 五個空殼 service（`ctx.channel` 是新增的第五個，見下方「多通訊平台閘道」）+ `ADR-0001`（為何選 Cordis）+ `ADR-0002`（為何預留 channel）。
`ctx.model` / `ctx.channel` 是唯二已經是「真的能用」的 registry（`register/get/list`），其他三個目前是純空殼，等對應階段補實作。

### Phase 2 — Domain 層（TDD）✅ 完成（2026-08-16）
**學習重點：** Room / Message / Agent / SandboxPolicy 的核心規則（例如「這個 Agent 能不能看到其他聊天室」）用純函式先寫測試再實作。
**交付物：** domain 單元測試（無 I/O），涵蓋 sandbox 可見性、Agent 指派邏輯。
**別忘記（來自 ADR-0002）：** Message 要能標記 `sourceChannel`（哪個外部平台來的，或 null 代表 Web UI 自己發的），
現在設計時就把這個欄位放進去，不要等 Phase 8 再回頭改。
**實際結果：** `src/plugins/chat/domain.ts` + `src/plugins/agent/domain.ts`，27 個測試全過，100% coverage。
測試工具用 Node 內建 `node:test`（不是 vitest——理由跟 Phase 0 的 esbuild 坑一致，見 MEM-20260816-phase2）。

### Phase 3 — Model Provider Plugins
**學習重點：** 用同一個 `ModelProvider` 介面，分別接 Ollama（本地）、OpenAI-相容端點（Claude/GPT/Gemini/Grok 大多有相容層或各自 SDK）、NVIDIA build.nvidia.com API。
**交付物：** 每家一個 Cordis plugin，`inject: ['model']`，呼叫 `ctx.model.register(...)`，可插拔切換，附整合測試（mock HTTP）。

### Phase 4 — 持久化與附件
**學習重點：** SQLite schema 設計（rooms/messages/agents/attachments）、檔案上傳（先存本地磁碟，之後再談雲端）。
**交付物：** storage plugin + 附件上傳 API + 整合測試（SQLite in-memory）。

### Phase 5 — 多 Agent 協作（Agent Loop/Graph 核心）
**學習重點：** 這是整個專案最有價值的部分——「範例2」的 manager-agent 模式：一個 Agent 收到任務後，自動建立聊天室、指派其他 Agent、追蹤進度。用 Cordis 的 event 系統做 Agent 間通訊。
**交付物：** 任務圖（DAG）資料結構、manager plugin、至少跑通一個「Allen 寫前端 / Ben 寫後端」的真實範例。

### Phase 6 — API + 聊天 UI MVP
**學習重點：** REST + WebSocket，前端用 React/Vite 做出類 WhatsApp 的群組介面（房間列表、選 Agent 看歷史）。
**交付物：** 可用的 Web UI，能開房間、選模型建 Agent、收發訊息。此階段也要生出一個 `ctx.api`（HTTP router）
service，Phase 8 的 channel adapter 會需要它來註冊 webhook route。

### Phase 7 — 插件市場
**學習重點：** 插件 manifest 格式、執行期動態啟停（正是 Cordis「可逆掛載」的用武之地）、sandbox 開關的 UI 化。
**交付物：** 一個範例第三方插件（例如 code-review skill）能透過市場安裝/移除，不用重啟服務。

### Phase 8 — 外部通訊平台閘道（WhatsApp / Messenger / 企業微信）【新增】
**學習重點：** Webhook 收（驗簽 + 解析各平台不同的 payload 格式）+ REST API 送是三個平台共通的架構；
差異在配額/視窗限制（WhatsApp tier 配額 + Template 訊息、Messenger 24h 窗口 + Message Tag）跟身分模型
（WeCom 走官方 OAuth callback，個人 WeChat **不做**，理由見 `ADR-0002`）。本機開發需要 ngrok /
Cloudflare Tunnel 之類的工具讓 Meta/企業微信能連到你的 webhook。
**交付物：** 三個 `ChannelAdapter` plugin（`whatsapp` / `messenger` / `wecom`），各自能收發一則測試訊息；
`ExternalIdentity` 對應表把外部使用者跟內部 Room 綁起來。

### Phase 9 — 安全、可觀測性、國際化、CI 收尾
**學習重點：** 把 4.3 節機密管理規則落地（`.env.example`、Gitleaks CI，這時候 `.env` 會真的有 WhatsApp/Messenger
的 App Secret、企業微信的 Token/AESKey，是機密掃描規則第一次真正派上用場的階段）、結構化 log + trace-id、
i18n（先做 zh-TW/en 兩語）、GitHub Actions（lint + unit test 必過，Gitleaks 必過，覆蓋率/Autocannon 壓測非強制擋 CI）。
**交付物：** 完整 CI pipeline、README 補完、輕量壓測報告。


---

## 5. 下一步

這是完整計畫，你可以先看過調整（例如要不要合併/拆分某些 Phase、順序要不要改），
確認沒問題後我們就從 **Phase 0** 開始，一步一步實作（照你原規範的習慣：每階段做完會請你確認再往下走）。
