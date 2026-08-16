# AI Hub

多 Agent 聊天協作平台 — 學習型開發專案。架構規範見 [`CLAUDE.md`](./CLAUDE.md)。

## 目前狀態：Phase 2 — Domain 層（TDD）✅

`src/plugins/chat/domain.ts`、`src/plugins/agent/domain.ts`：Room/Message/Agent/TaskAssignment
的純函式邏輯 + sandbox 可見性規則，27 個測試、100% coverage，測試工具用 Node 內建 `node:test`
（不用 vitest，理由跟 esbuild/Big Sur 那個坑一致，見 `memory/MEM-20260816-phase2-domain-and-testing.md`）。

五個 service 邊界（Phase 1）：`ctx.chat` / `ctx.agent` / `ctx.model` / `ctx.storage` / `ctx.channel`
（`channel` 為未來 WhatsApp/Messenger/企業微信整合預留，見 `docs/adr/ADR-0002-channel-gateway.md`）。

- Plugin kernel：[`cordis`](https://github.com/cordiverse/cordis)
- Runtime：Node.js 內建 TypeScript type-stripping，無編譯步驟、無 esbuild 依賴
- 測試：Node 內建 `node:test`，同樣無 native binary 依賴
- Package manager：pnpm

## 快速開始

```bash
pnpm install
pnpm start        # 跑 kernel，掛載五個 service（node src/index.ts）
pnpm dev          # watch 模式
pnpm test         # 跑 domain 單元測試 + coverage report
pnpm typecheck    # 靜態型別檢查
```

預期輸出：

```bash
--- AI Hub kernel booted (Phase 1) ---
services online: chat, agent, model, storage, channel
model providers registered: []
channel adapters registered: []
```

`pnpm test` 預期看到 `# pass 27` `# fail 0`，coverage report 顯示兩個 `domain.ts` 都 100%。

## Domain 層（Phase 2）

| 檔案 | 涵蓋 |
|---|---|
| `src/plugins/chat/domain.ts` | `Room` / `Message` / sandbox 可見性規則（`canAgentViewRoom`） |
| `src/plugins/agent/domain.ts` | `Agent` / `TaskAssignment`（Phase 5 多 Agent 協作的最小構件） |

## 已知的坑

見 [`error/ERR-20260816-cordis-nodenext-imports.md`](./error/ERR-20260816-cordis-nodenext-imports.md)：
tsconfig 必須用 `moduleResolution: "Bundler"`，不能用 `NodeNext`（cordis rc 版型別檔案的相容性問題）。

## 目錄結構

完整結構與各階段規劃見 [`CLAUDE.md`](./CLAUDE.md) 第 3、4 節。
