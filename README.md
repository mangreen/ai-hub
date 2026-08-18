# AI Hub

多 Agent 聊天協作平台 — 學習型開發專案。架構規範見 [`CLAUDE.md`](./CLAUDE.md)（含採用的
DeepSeek Harness skills，見 CLAUDE.md 2.1 節）。系統架構圖跟 Cordis 依賴圖見
[`docs/architecture/`](./docs/architecture/)。

## 目前狀態：Phase 3 — Model Provider Plugins ✅

七家 model provider 已接上 `ctx.model`：Ollama（本地）、OpenAI、Gemini、Grok、NVIDIA NIM、
**OpenRouter**、Claude。其中六家（不含 Claude）共用同一套 OpenAI-相容 client；Claude 走
Anthropic 原生 Messages API——原因跟完整比較表見
[`docs/adr/ADR-0003-model-provider-architecture.md`](./docs/adr/ADR-0003-model-provider-architecture.md)。

`src/plugins/chat/domain.ts`、`src/plugins/agent/domain.ts`：Room/Message/Agent/TaskAssignment
的純函式邏輯 + sandbox 可見性規則，測試工具用 Node 內建 `node:test`
（不用 vitest，理由跟 esbuild/Big Sur 那個坑一致，見 `memory/MEM-20260816-phase2-domain-and-testing.md`）。

五個 service 邊界（Phase 1）：`ctx.chat` / `ctx.agent` / `ctx.model` / `ctx.storage` / `ctx.channel`
（`channel` 為未來 WhatsApp/Messenger/企業微信整合預留，見 `docs/adr/ADR-0002-channel-gateway.md`）。
`ModelService`/`ChannelService` 的 `register()` 回傳 Cordis effect disposer，但 provider
plugin 自己不需要手動存它——plugin 卸載時會自動連帶清掉註冊，見
`memory/MEM-20260817-phase3-provider-research.md`。

- Plugin kernel：[`cordis`](https://github.com/cordiverse/cordis)
- Runtime：Node.js 內建 TypeScript type-stripping，無編譯步驟、無 esbuild 依賴
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
pnpm start        # 跑 kernel，掛載五個 service + 七個 model provider
pnpm dev          # watch 模式
pnpm test         # 跑全部測試 + coverage report
pnpm typecheck    # 靜態型別檢查
```

預期輸出（沒設定 `.env` 也一樣能開機——見「設定 API Key」一節）：

```bash
--- AI Hub kernel booted ---
services online: chat, agent, model, storage, channel
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
```

`pnpm test` 預期看到 `# tests 55` `# pass 55` `# fail 0`。

## 測試涵蓋

| 檔案 | 涵蓋 |
|---|---|
| `src/plugins/chat/domain.ts` | `Room` / `Message` / sandbox 可見性規則（`canAgentViewRoom`）— Phase 2 |
| `src/plugins/agent/domain.ts` | `Agent` / `TaskAssignment`（Phase 5 多 Agent 協作的最小構件）— Phase 2 |
| `src/plugins/model/index.ts` | `ModelService` 的 register/get/list + effect-based dispose |
| `src/plugins/channel/index.ts` | `ChannelService` 的 register/get/list + effect-based dispose |
| `src/plugins/model/openai-compatible/client.ts` | 六家共用的 OpenAI-相容 HTTP client（mock fetch，不打真實 API）— Phase 3 |
| `src/plugins/model/anthropic/client.ts` | Claude 原生 Messages API client（mock fetch）— Phase 3 |
| `src/plugins/model/all-providers.test.ts` | 七個 provider plugin 一起掛載的整合測試 — Phase 3 |

## 連接真實 Model Provider 測試 (以 OpenRouter 為例)

phase3 一次性的手動測試腳本，不是專案的一部分——純粹用來從命令列打一次 provider，確認接線接對了。跑法：

### 測試腳本

`.tmp/test-openrouter.ts`

```typescript
import { Context } from 'cordis'
import { ModelService } from '../src/plugins/model/index.ts'
import * as openrouterProvider from '../src/plugins/model/openrouter/index.ts'

const ctx = new Context()
ctx.plugin(ModelService)
ctx.plugin(openrouterProvider)

// 跟整個專案其他地方一樣的 inject 寫法（從 Phase 0 就是這個模式）——
// 保證 ctx.model 存在、而且上面的 openrouter plugin 已經註冊完，這個
// callback 才會執行。
ctx.plugin({
  name: 'scratch-test',
  inject: ['model'],
  async apply(ctx: Context) {
    const provider = ctx.model.get('openrouter')
    if (!provider) {
      throw new Error('openrouter provider 沒註冊到——上面的 plugin 掛載失敗了？')
    }

    console.log('打給 OpenRouter...')
    try {
      const result = await provider.complete(
        [{ role: 'user', content: 'Say hello in one short sentence.' }],
        'nvidia/nemotron-3-ultra-550b-a55b:free',
      )
      console.log('回應的 model：', result.model)
      console.log(result.content)
    } catch (err) {
      // 一定要包 try/catch：Cordis 的 fiber 執行環境不會像一般 top-level
      // await 那樣把 unhandled rejection 清楚印出來，錯誤可能就這樣無聲消失。
      console.error('呼叫失敗：', (err as Error).message)
      process.exitCode = 1
    }
  },
})
```

### 怎麼跑

```bash
cp .env.example .env # 編輯 .env，填入 OPENROUTER_API_KEY=sk-or-v1-...
node --env-file-if-exists=.env .tmp/test-openrouter.ts
```
需要先 `cp .env.example .env`，並填入 OPENROUTER_API_KEY。

### 我實際測過的兩件事

***1. 沒有 try/catch 會怎樣***
我一開始寫的版本沒包 try/catch，跑起來只印了「打給 OpenRouter...」就沒了，
看起來像卡住，其實是錯誤被 Cordis 的 fiber 執行環境吞掉、沒印出來。
這是個真的會讓人卡住除錯的坑，所以最終版本一定要包 try/catch，把 .message 印出來。

***2. 包了 try/catch 之後，在我的沙盒裡實際跑出的錯誤***
```bash
呼叫失敗： OpenAI-compatible request to https://openrouter.ai/api/v1 failed: 403 Host not in allowlist: openrouter.ai...
```
這個 403 不是 OpenRouter 回的，是我自己執行環境的網路限制擋下來的（我的沙盒不能連 openrouter.ai）。
重點是：這證明程式碼一路正確地打到了真實的 HTTP 呼叫，chatCompletion() 的錯誤處理也正確接住並清楚印出來了。
在你自己的 Mac 上（有正常網路 + 填了真的 API key），這行會換成 OpenRouter 真正回傳的內容。

## 已知的坑

見 [`error/ERR-20260816-cordis-nodenext-imports.md`](./error/ERR-20260816-cordis-nodenext-imports.md)：
tsconfig 必須用 `moduleResolution: "Bundler"`，不能用 `NodeNext`（cordis rc 版型別檔案的相容性問題）。

## 目錄結構

完整結構與各階段規劃見 [`CLAUDE.md`](./CLAUDE.md) 第 3、4 節。
