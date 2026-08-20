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
| TDD | 所有功能 Red-Green-Refactor | Domain 邏輯（Agent 分配、isolation 可見性規則）**必須**先寫測試；UI/黏合層可以先跑起來再補測試 | 單人開發，UI 反覆試錯階段寫測試效益低 |
| 覆蓋率 Gate | CI 強制 80% 否則擋 merge | 目標 60–70%（僅 domain/application 層），用 `node --test --experimental-test-coverage` 看趨勢，不設 CI 硬擋 | 沒有團隊審查壓力，硬 gate 只會拖慢學習節奏；測試工具本身也不用 vitest，見下方 2.1 |
| 整合測試環境 | Testcontainers 真實 DB | SQLite in-memory（`:memory:`）即可，Docker 留到 Phase 8 | 避開 Big Sur 上 Docker Desktop 相容性問題 |
| 壓測 | K6 / Autocannon 正式壓測 | 延後到 Phase 8，用 Autocannon（比 K6 輕、免額外安裝） | 機器效能有限，先求功能正確 |
| 機密管理（4.3 節） | 完整規則 | **完全保留，不砍** | 這是唯一「多人/單人都一樣重要」的規則——一旦洩漏 API key 沒有例外 |
| Git 流程 | 每個 TDD cycle commit | 保留：每階段開一個 `phase/N-主題` branch，完成後 merge 回 main + 打 tag | 符合你原本非功能需求「每個階段開新 branch」 |
| 文件（MEM/ERR/SKILL/ADR） | 全套維護 | 保留但簡化：每階段結束寫 1 篇 MEM（決策）+ 有錯誤才寫 ERR，不強制每個小決定都建檔 | 過度建檔對單人專案是負擔，抓大放小 |
| Coverage/Secrets CI 掃描 | GitHub Actions 全套 | 保留 **Gitleaks**（機密掃描，成本低效益高）；lint + unit test 也上 CI；覆蓋率/壓測 CI 留到 Phase 8 | 分階段導入 CI，避免一開始就卡在 pipeline 設定 |

### 2.1 採用的 DeepSeek Harness Skills（`.agents/skills`）

DeepSeek Harness 的倉庫在 `.agents/skills` 下有 11 個 SKILL.md（`dsh-archive-agent-notes`、
`dsh-code-review`、`dsh-doc-site-sync`、`dsh-doc-standards`、`dsh-find-simplifications`、
`dsh-merging-stacked-prs`、`dsh-pre-push-checks`、`dsh-prose-standard`、`dsh-translate-docs`、
`dsh-trim-cot-leakage`、`record-browser-gif`）。GitHub 擋掉了對目錄頁的自動存取，實際完整讀到的
只有 `dsh-pre-push-checks`、`dsh-prose-standard`、`dsh-doc-standards` 三份 + 倉庫根目錄的
`AGENTS.md`；其餘檔名已知但內容未讀，不假裝讀過。以下兩條規則來自這三份，判斷跟這個專案的規模
（單人、無 CI 團隊審查）直接相關，正式採用：

**A. 註解/文件撰寫標準（採自 `dsh-prose-standard`）**
- comment 只寫「非顯而易見的 contract」（前置/後置條件、不變量、誰擁有什麼、失敗時會怎樣）—— 不重述
  code 已經表達出來的事。改動一個函式時，先問「這行 comment 是在講 code 看不出來的事，還是在複述
  control flow」，是後者就刪。
- Public API（例如 Service 的 public method、export 的 type）要交代：回傳值的語意差異、什麼情況下
  throw、side effect、誰擁有回傳的資源。
- Test 只解釋「為什麼需要這個測試案例／這個 fixture」，不要逐行講「這行在斷言什麼」——code 本身就是
  那個答案。
- 字數變少不等於變好；拿掉的前提是每個事實（誰、在什麼條件下、承諾什麼、例外是什麼）都還在，只是講得
  更精準。

**B. Push/Merge 前的檢查範圍（採自 `dsh-pre-push-checks`，大幅簡化到單人專案的規模）**
- 原規則的核心精神：**選跟這次改動範圍相符的最小檢查**，不要每次都反射性跑全部。dsh 是大型 monorepo
  才需要這麼精細的分流；我們專案目前小，所以簡化成：
  - 動到 `domain.ts` / `*.test.ts` → `pnpm test`
  - 動到 service 的 Cordis 接線（`index.ts` 的 `declare module`、`inject`、`ctx.plugin`）→
    `pnpm typecheck` + `pnpm start`
  - 只動文件（`CLAUDE.md`/`README.md`/`docs/`/`memory/`/`error/`）→ 人工讀一次，不需要重跑測試
  - 不確定就三個都跑——專案還小，全套成本很低，等專案變大、測試變慢了再回頭套用 dsh 那套更精細的
    「match evidence to the surface」分流規則。

**這兩條規則跟未來開發的關係：** 寫進本檔案，本檔案是每個 Phase 開始時都會重新讀的專案憲章，之後任何
一個 Phase 寫 comment、寫 test、或要 commit/push 前，都直接套用這裡的規則，不用另外去記或查
原始 skill 檔案。詳細研究過程見 `memory/MEM-20260816-registrations-as-effects.md`
（順帶從 `AGENTS.md` 的「registrations are effects」慣例挖出一個真的補上的 bug：
`ModelService`/`ChannelService` 的 `register()` 原本不能撤銷註冊，已補上 disposer）。

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
│   │   ├── chat/              # 聊天室/訊息/isolation 可見性 service
│   │   ├── agent/             # Agent 定義、任務指派、多 Agent 協作 loop
│   │   ├── model/              # 各家模型 provider（下面拆一層）
│   │   │   ├── ollama/
│   │   │   ├── openai-compatible/   # Claude / GPT / Gemini / Grok / NVIDIA build 共用介面
│   │   │   └── ...
│   │   ├── storage/            # SQLite + 附件檔案儲存
│   │   ├── channel/            # 外部通訊平台 adapter（whatsapp/messenger/wecom，Phase 8）
│   │   └── marketplace/        # 插件市場：manifest、動態啟停
│   └── web/                   # React/Vite 前端
└── .github/workflows/         # CI（分階段擴充）
```

---

## 4. 開發階段（每階段結束：merge branch → 更新 CHANGELOG/todo.md → 寫 1 篇 MEM → 更新架構圖 → 用 2.1 的規則自我審查一次 comment/文件 → push 前照 2.1-B 選最小檢查範圍 → 跟你確認後才進下一階段）

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
**交付物：** domain 單元測試（無 I/O），涵蓋 isolation 可見性、Agent 指派邏輯。
（`sandboxed` 欄位已於 2026-08-19 改名 `isolated`，見 ADR-0006、MEM-20260819-isolation-rename.md。）
**別忘記（來自 ADR-0002）：** Message 要能標記 `sourceChannel`（哪個外部平台來的，或 null 代表 Web UI 自己發的），
現在設計時就把這個欄位放進去，不要等 Phase 8 再回頭改。
**實際結果：** `src/plugins/chat/domain.ts` + `src/plugins/agent/domain.ts`，27 個測試全過，100% coverage。
測試工具用 Node 內建 `node:test`（不是 vitest——理由跟 Phase 0 的 esbuild 坑一致，見 MEM-20260816-phase2）。

### Phase 2.5 — Phase 3 前置整理 ✅ 完成（2026-08-16）
**這不是原計畫的一個 Phase，是你主動要求在 Phase 3 前做的一輪整理：**
1. 研究 DeepSeek Harness 的 `.agents/skills`，把其中兩條規則整合進本檔案 2.1 節
   （並確保 Section 4 的每階段流程會用到它，不是寫了就沒人看）。
2. 系統架構圖 + Cordis 依賴圖（Mermaid，非 ASCII——手畫 ASCII 對不齊 CJK/ASCII 混排寬度，
   改用有實際跑 `mermaid.parse()` 驗證過語法的 Mermaid），放在 `docs/architecture/`。
3. 全部原始碼過一輪 comment/文件審查，套用 2.1-A 的標準；順便抓到並修好幾個已經過期的引用
   （指向被刪除的 Phase 0 demo 檔案、"Phase 2 TODO" 但 Phase 2 其實已經做完的字眼）。
4. 從 skill 研究裡帶出一個真的要修的 bug：`register()` 沒辦法撤銷，用 TDD 補上
   （見 MEM-20260816-registrations-as-effects.md）。

### Phase 3 — Model Provider Plugins ✅ 完成（2026-08-17）
**學習重點：** 用同一個 `ModelProvider` 介面，分別接 Ollama（本地）、OpenAI-相容端點（Claude/GPT/Gemini/Grok 大多有相容層或各自 SDK）、NVIDIA build.nvidia.com API。
**交付物：** 每家一個 Cordis plugin，`inject: ['model']`，呼叫 `ctx.model.register(...)`（記得保留回傳的 disposer），可插拔切換，附整合測試（mock HTTP）。
**實際結果跟原計畫的差異：**
- 新增 **OpenRouter** 為第 6 家（使用者要求），最終是 7 家 provider：Ollama、OpenAI、
  Gemini、Grok、NVIDIA NIM、OpenRouter、Claude。
- 原計畫「Claude/GPT/Gemini/Grok 都走 OpenAI 相容端點」查證後不準確：**只有 6 家
  （不含 Claude）是共用一套 `openai-compatible/client.ts`**；Claude 走 Anthropic
  原生 Messages API，因為 Anthropic 自己的文件明講 OpenAI 相容層只給測試用，不是
  production-ready（見 ADR-0003）。
- `register()` 的 disposer **不需要**手動存——實驗證明 plugin 自己的 fiber 被卸載時會
  自動連帶清掉它註冊的東西（見 MEM-20260817-phase3-provider-research.md），上面那句
  「記得保留」是原計畫寫的，實際上不用。
- 新增 `.env.example`（本專案第一次真的需要 API key）、`package.json` 的
  `start`/`dev` 改用 `node --env-file-if-exists=.env`。
- `pnpm test` 實際跑出 **55 個測試全過**（chat/agent domain 27、model registry 6、
  channel registry 4、openai-compatible client 9、anthropic client 8、7-provider
  整合測試 1）。

### Phase 4 — 持久化與附件 ✅ 完成（2026-08-17）
**學習重點：** SQLite schema 設計（rooms/messages/agents/attachments）、檔案上傳（先存本地磁碟，之後再談雲端）。
**交付物：** storage plugin + 附件上傳 API + 整合測試（SQLite in-memory）。
**實際結果跟原計畫的差異：**
- 用 **`node:sqlite`**（Node 22.5+ 內建模組），不是 `better-sqlite3`——後者是 native addon，
  跟這台機器已經踩過的 Big Sur/esbuild 坑是同一類風險，`node:sqlite` 編譯進 Node 本身，
  沒有這個問題。仍是 Node 標記的實驗性功能（會印一次 `ExperimentalWarning`），但功能可用。
  完整理由見 ADR-0004。
- **`ChatService`/`AgentService` 現在 `static inject = ['storage']`**——這是本專案第一次
  有 service 互相 inject，動手寫之前先驗證過 Service class 的 `static inject` 語法真的有效
  （見 MEM-20260817-phase4-storage-and-static-inject.md），`docs/architecture/cordis-dependency-graph.md`
  已更新反映這個變化。
- `AgentService` 也補上 `createAgent`/`getAgent`/`listAgents`（原計畫只明確提到 ChatService，
  但 schema 本來就要包含 `agents` 表，順便把對稱的 CRUD 也做了；task-assignment 持久化留給
  Phase 5，因為那才是真正需要狀態的地方）。
- 「附件上傳 API」目前是 `StorageService.saveAttachment()`（存到本地磁碟 + 寫 DB row）——
  真正的 HTTP 上傳端點要等 Phase 6 有 `ctx.api` 才能做，Phase 4 這裡先把底層能力做好。
- `pnpm test` 實際跑出 **82 個測試全過**。

### Phase 5 — 多 Agent 協作（Agent Loop/Graph 核心）【進行中：registry+schema 已完成，task-graph 策略尚未開始】
**學習重點：** 這是整個專案最有價值的部分——「範例2」的 manager-agent 模式：一個 Agent 收到任務後，自動建立聊天室、指派其他 Agent、追蹤進度。用 Cordis 的 event 系統做 Agent 間通訊。
**交付物（動手寫之前，先讀 `docs/adr/ADR-0005-orchestrator-and-workflow-architecture.md`、
`docs/adr/ADR-0007-orchestrator-implementation-and-dag-storage.md`）：**
- ✅ 新 service `ctx.orchestrator`（registry pattern，跟 `ctx.model`/`ctx.channel` 同一套）——
  Agent Loop/Graph 本身也是可替換插件，不是寫死在 `AgentService` 裡。**自己寫，不用
  LangGraph.js 或 openai-agents-js**——理由跟查證過程見 ADR-0007（簡言之：兩者都會讓
  「可替換」名存實亡，且都不完全貼合我們已經做好的 provider-中立 model 層跟
  `node:sqlite` persistence）。
- ✅ `StorageService` schema 新增：`workflow_definitions`（`definition_json` 存整個
  DAG，掛回 `ctx.chat` 的 Room，未來可被 UI 查看/編輯/創建）、`workflow_runs`
  （一次執行）、`task_node_runs`（正規化 table，每個 node 的執行狀態）、
  `activity_log`（誰呼叫了什麼服務/tool、花多久、可搜尋——`metadata` 絕對不能塞
  原始 API key 或完整 payload，五個索引支援搜尋）。具體欄位見 ADR-0007。**不用
  sqlite-graph 或任何圖資料庫**——查證過，不成熟、依賴 `better-sqlite3`（Big Sur 風險），
  而且我們的 DAG 規模用一般 SQL 就綽綽有餘。
- ✅ 新 service `ctx.sandbox`（registry，見 ADR-0006）——**只做介面，這個 Phase 不實作
  具體後端**。`WorkflowDefinition` 多一個 `sandboxExecutor: string | null` 欄位。
- ✅ 純函式 `validateAcyclic(nodes, edges)`（DAG 驗證，Kahn's algorithm，先寫測試再實作，
  同 Phase 2 套路；連帶做了 `createWorkflowDefinition`，驗證失敗會拋錯）。
- ⬜ 一個預設 orchestration strategy plugin（`task-graph`），註冊進 `ctx.orchestrator`，
  真正跑起來 emit `'agent/task-assigned'`（Phase 1 就保留但沒人 emit 過的事件），並透過
  `ctx.chat.postMessage` 把進度發回房間（讓 `'chat/message'` 事件也第一次真正被觸發的路徑）。
- ⬜ 至少跑通一個「Allen 寫前端 / Ben 寫後端」的真實範例。
- **範圍較大，已照計畫拆成兩塊**：這次做完「registry + schema」（`ctx.orchestrator`、
  `ctx.sandbox`、四張新表、`validateAcyclic`，113 個測試全過），「預設策略」留給下一輪，
  符合 Section 1 的「拆到最小可執行單位」。

### Phase 5.5 — 執行沙盒後端實作【新增，見 ADR-0006，實作尚未開始】
**學習重點：** `ctx.sandbox` 的具體 executor 實作，搭配這個專案第一次真正的
tool calling（沒有 tool calling，沙盒沒有真正的呼叫方）。
**交付物：**
- **Seatbelt executor**（macOS `sandbox-exec`）——這台開發機唯一原生可用的本機選項，
  優先做。文件要誠實標注 `sandbox-exec` 是 Apple 已棄用但目前仍可用、無官方替代方案
  的工具（見 ADR-0006 查證的具體案例）。**先寫測試證明限制真的有生效**（例如寫入
  workspace 外的檔案要被拒絕），不能只驗證指令有跑起來就算過關。
- **一個雲端 API executor**（例如 E2B，呼應 DeepSeek Harness 自己的 `e2b/` package、
  openai-agents-js 官方託管 provider 清單也有它）——平台無關的保底選項。
- `bwrap`/`Landlock` 的 `SandboxExecutor` 介面先定義，`isAvailable()` 在這台
  （非 Linux）機器上誠實回傳 `false`，實作留給有 Linux 環境（CI 或未來部署）時再補。
- `activity_log` 新增 `kind: 'sandboxed_execution'`。

### Phase 6 — API + 聊天 UI MVP
**學習重點：** REST + WebSocket，前端用 React/Vite 做出類 WhatsApp 的群組介面（房間列表、選 Agent 看歷史）。
**交付物：** 可用的 Web UI，能開房間、選模型建 Agent、收發訊息。此階段也要生出一個 `ctx.api`（HTTP router）
service，Phase 8 的 channel adapter 會需要它來註冊 webhook route。**Phase 5 之後新增：**
workflow definition 的 CRUD 端點（讓 UI 能查看/編輯/創建工作流程）、workflow run 狀態查詢/串流、
activity log 搜尋端點、`ctx.orchestrator.list()` 讓 UI 顯示可選的協作策略。

### Phase 7 — 插件市場
**學習重點：** 插件 manifest 格式、執行期動態啟停（正是 Cordis「可逆掛載」的用武之地）、isolation 開關的 UI 化。
**交付物：** 一個範例第三方插件（例如 code-review skill）能透過市場安裝/移除，不用重啟服務。
**Phase 5 之後新增：** orchestration strategy 成為第三種可透過市場管理的插件類別，
跟 model provider、channel adapter 並列。

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
