# AI Hub

多 Agent 聊天協作平台 — 學習型開發專案。架構規範見 [`CLAUDE.md`](./CLAUDE.md)（含採用的
DeepSeek Harness skills，見 CLAUDE.md 2.1 節）。系統架構圖跟 Cordis 依賴圖見
[`docs/architecture/`](./docs/architecture/)。

## 目前狀態：Phase 5.5 — 執行沙盒 Executor ✅（Docker 已在真實環境驗證；Seatbelt 修過一個真的 bug、待重新驗證；E2B 延後）

`ctx.sandbox` 現在有兩個真的能用的 executor：**Seatbelt**（macOS `sandbox-exec`，
profile 設計參考 Anthropic 自己的 `sandbox-runtime` 專案）跟 **Docker**（你確認本機
Docker Desktop 4.12.0 足夠用，不需要處理 Big Sur 相容性問題）。兩個都用「純函式建構
指令 + injectable spawn」模式（跟 Phase 3 的 model client 一致）。

**`pnpm verify:docker` 在真實環境 4 項全過**，沒有任何問題。

**`pnpm verify:seatbelt` 第一次跑，4 項裡 2 項 FAIL**——包括最基本的「能寫入
workspace 內」。根因：macOS 的 `/tmp`/`/var` 是 symlink，`sandbox-exec` 的路徑比對
用解析過的真實路徑，原本的實作沒有解析就把路徑塞進 SBPL profile。已修正（見
`memory/MEM-20260821-seatbelt-realpath-fix.md`），**但這個修正還沒有重新在真實 Mac
上驗證過**——下一步是重跑 `pnpm verify:seatbelt` 確認 4 項全過。完整決策過程見
[`docs/adr/ADR-0008-phase5.5-seatbelt-docker-implementation.md`](./docs/adr/ADR-0008-phase5.5-seatbelt-docker-implementation.md)。

## Phase 5 — 多 Agent 協作 ✅

`ctx.orchestrator`（策略 registry + workflow 持久化，自己寫不用 LangGraph.js/
openai-agents-js，理由見
[`docs/adr/ADR-0007-orchestrator-implementation-and-dag-storage.md`](./docs/adr/ADR-0007-orchestrator-implementation-and-dag-storage.md)）
搭配預設的 **`task-graph` 策略**（`src/plugins/orchestrator/task-graph/`）：依拓撲順序
執行 workflow 的每個 node，查 Agent、解析 `modelRef`、呼叫 `ctx.model`、把結果發回
`ctx.chat`、記錄 `workflow_runs`/`task_node_runs`/`activity_log`。真正 emit 了
`'agent/task-assigned'`（Phase 1 保留至今）跟 `'chat/message'`（Phase 2 保留至今）
兩個事件。整合測試用假的 `ModelProvider`（不打真實 API）驗證了「Allen 寫前端 /
Ben 寫後端」的依賴順序執行、成功/失敗路徑都對。

`ChatService`/`AgentService` 持久化到 SQLite（`node:sqlite`，Node 內建，理由見
[`docs/adr/ADR-0004-storage-architecture.md`](./docs/adr/ADR-0004-storage-architecture.md)）。
Room/Message/Agent 的驗證規則走各自 `domain.ts` 的純函式，Service 層只負責把驗證過的
資料寫進/讀出資料庫。附件用 `StorageService.saveAttachment()` 存到本地磁碟。

七家 model provider 已接上 `ctx.model`：Ollama（本地）、OpenAI、Gemini、Grok、NVIDIA NIM、
**OpenRouter**、Claude。其中六家（不含 Claude）共用同一套 OpenAI-相容 client；Claude 走
Anthropic 原生 Messages API——原因跟完整比較表見
[`docs/adr/ADR-0003-model-provider-architecture.md`](./docs/adr/ADR-0003-model-provider-architecture.md)。

`src/plugins/chat/domain.ts`、`src/plugins/agent/domain.ts`、`src/plugins/orchestrator/domain.ts`：
Room/Message/Agent/TaskAssignment/WorkflowDefinition 的純函式邏輯 + isolation 可見性規則，
測試工具用 Node 內建 `node:test`
（不用 vitest，理由跟 esbuild/Big Sur 那個坑一致，見 `memory/MEM-20260816-phase2-domain-and-testing.md`）。

七個 service 邊界：`ctx.chat` / `ctx.agent` / `ctx.model` / `ctx.storage` / `ctx.channel` /
`ctx.orchestrator` / `ctx.sandbox`
（`channel` 為未來 WhatsApp/Messenger/企業微信整合預留，見 `docs/adr/ADR-0002-channel-gateway.md`）。
`ChatService`/`AgentService` 都 `static inject = ['storage']`，見
`docs/architecture/cordis-dependency-graph.md`。
`ModelService`/`ChannelService`/`ctx.orchestrator`/`ctx.sandbox` 的 `register()` 都回傳
Cordis effect disposer，但呼叫端不需要手動存它——plugin 卸載時會自動連帶清掉註冊，見
`memory/MEM-20260817-phase3-provider-research.md`。

`Room` 的可見性欄位叫 `isolated`（不叫 `sandboxed`，那個字留給 `ctx.sandbox` 的執行隔離；
也不叫 `memoryIsolated`，因為隔離的範圍比「記憶」更廣，見
`memory/MEM-20260819-isolation-rename.md`）。

- Plugin kernel：[`cordis`](https://github.com/cordiverse/cordis)
- Runtime：Node.js 內建 TypeScript type-stripping，無編譯步驟、無 esbuild 依賴
- 持久化：`node:sqlite`（Node 內建，同樣無 native binary 依賴）
- 測試：Node 內建 `node:test`，同樣無 native binary 依賴
- Package manager：pnpm

## 設定 API Key

```bash
cp .env.example .env
# 編輯 .env，填入你要用的 provider 的 key（不用全部填，沒填的 provider 仍會註冊成功，
# 只有真的呼叫 .complete() 時才會因為缺 key 而報錯）
```

## 快速開始

```bash
pnpm install
pnpm start        # 跑 kernel，掛載七個 service + 七個 model provider
pnpm dev          # watch 模式
pnpm test         # 跑全部測試 + coverage report
pnpm typecheck    # 靜態型別檢查
```

預期輸出（沒設定 `.env` 也一樣能開機——見「設定 API Key」一節）：

```bash
--- AI Hub kernel booted ---
services online: chat, agent, model, storage, channel, orchestrator, sandbox
model providers registered: [
  'ollama',
  'openai',
  'gemini',
  'grok',
  'nvidia-nim',
  'openrouter',
  'claude'
]
channel adapters registered: []
orchestration strategies registered: [ 'task-graph' ]
sandbox executors registered: [ 'seatbelt', 'docker' ]
```

`pnpm test` 預期看到 `# tests 164` `# pass 164` `# fail 0`。

## 驗證 sandbox executor 真的隔離有效（需要真實環境，不是 `pnpm test` 能做的事）

```bash
pnpm verify:seatbelt   # 只在 macOS 上有意義
pnpm verify:docker     # 需要 Docker 真的在跑（例如你本機的 Docker Desktop）
```

`pnpm test` 只驗證「指令組出來的樣子對不對」（這個專案的開發機是 Linux，兩個
executor 都無法在這裡真的執行），這兩個腳本才是真正驗證「隔離擋不擋得住」。

## 測試涵蓋

| 檔案 | 涵蓋 |
|---|---|
| `src/plugins/chat/domain.ts` | `Room` / `Message` / isolation 可見性規則（`canAgentViewRoom`）— Phase 2 |
| `src/plugins/agent/domain.ts` | `Agent` / `TaskAssignment`（Phase 2）+ `parseModelRef`（Phase 5，`ctx.model` 查找用） |
| `src/plugins/orchestrator/domain.ts` | `WorkflowDefinition` / `validateAcyclic`+`topologicalOrder`（Kahn's algorithm）— Phase 5 |
| `src/plugins/orchestrator/index.ts` | `OrchestratorService` 的 register/get/list + createWorkflow/getWorkflow/run — Phase 5 |
| `src/plugins/orchestrator/task-graph/index.ts` | 預設協作策略：依拓撲順序執行、事件 emit、activity_log — Phase 5 |
| `src/plugins/sandbox/seatbelt/index.ts` | SBPL profile 建構（純函式）+ 呼叫形狀（mock spawn）— Phase 5.5 |
| `src/plugins/sandbox/docker/index.ts` | `docker run` 參數建構（純函式）+ 呼叫形狀（mock spawn）— Phase 5.5 |
| `src/plugins/sandbox/index.ts` | `SandboxService` 的 register/get/list + effect-based dispose — Phase 5 |
| `src/plugins/model/index.ts` | `ModelService` 的 register/get/list + effect-based dispose |
| `src/plugins/channel/index.ts` | `ChannelService` 的 register/get/list + effect-based dispose |
| `src/plugins/model/openai-compatible/client.ts` | 六家共用的 OpenAI-相容 HTTP client（mock fetch，不打真實 API）— Phase 3 |
| `src/plugins/model/anthropic/client.ts` | Claude 原生 Messages API client（mock fetch）— Phase 3 |
| `src/plugins/model/all-providers.test.ts` | 七個 provider plugin 一起掛載的整合測試 — Phase 3 |
| `src/plugins/storage/index.ts` | SQLite schema、run/get/all、saveAttachment、workflow/activity_log 表 — Phase 4/5 |
| `src/plugins/chat/index.ts` | `ChatService` 的 createRoom/addMember/postMessage/listMessages/canAgentViewRoom（真的持久化） — Phase 4 |
| `src/plugins/agent/index.ts` | `AgentService` 的 createAgent/getAgent/listAgents（真的持久化） — Phase 4 |

## 已知的坑

見 [`error/ERR-20260816-cordis-nodenext-imports.md`](./error/ERR-20260816-cordis-nodenext-imports.md)：
tsconfig 必須用 `moduleResolution: "Bundler"`，不能用 `NodeNext`（cordis rc 版型別檔案的相容性問題）。

## 目錄結構

完整結構與各階段規劃見 [`CLAUDE.md`](./CLAUDE.md) 第 3、4 節。
