# AI Hub

多 Agent 聊天協作平台 — 學習型開發專案。架構規範見 [`CLAUDE.md`](./CLAUDE.md)。

## 目前狀態：Phase 1 — Plugin Kernel 骨架 ✅

五個 service 邊界已建立：`ctx.chat` / `ctx.agent` / `ctx.model` / `ctx.storage` / `ctx.channel`
（`channel` 是新增的第五個，為未來 WhatsApp/Messenger/企業微信整合預留，見 `docs/adr/ADR-0002-channel-gateway.md`）。
`model` 和 `channel` 已經是可用的 registry；其餘三個是空殼，等對應階段補實作。

- Plugin kernel：[`cordis`](https://github.com/cordiverse/cordis)
- Runtime：Node.js 內建 TypeScript type-stripping 直接執行 `.ts`，無編譯步驟、無 esbuild 依賴
  （原本用 `tsx`，但其依賴的 `esbuild` native binary 不支援 macOS Big Sur，見 `error/ERR-20260816-esbuild-bigsur-incompatible.md`）
- Package manager：pnpm

## 快速開始

```bash
pnpm install
pnpm start        # 跑 Phase 1 kernel，掛載五個 service（node src/index.ts）
pnpm dev          # watch 模式（node --watch src/index.ts）
pnpm typecheck    # 靜態型別檢查
```

預期輸出：

```bash
--- AI Hub kernel booted (Phase 1) ---
services online: chat, agent, model, storage, channel
model providers registered: []
channel adapters registered: []
```

## Phase 0 的「hello plugin」範例

`src/plugins/greeter.ts` / `consumer.ts` / `event-demo.ts` — Service / inject / event 三個 Cordis 核心概念的最小範例，三種 Cordis plugins 寫法。

已刪除，可切換至 git 分支：`phase/0-environment-cordis-basics` 查看對照。

## 已知的坑

見 [`error/ERR-20260816-cordis-nodenext-imports.md`](./error/ERR-20260816-cordis-nodenext-imports.md)：
tsconfig 必須用 `moduleResolution: "Bundler"`，不能用 `NodeNext`（cordis rc 版型別檔案的相容性問題）。

## 目錄結構

完整結構與各階段規劃見 [`CLAUDE.md`](./CLAUDE.md) 第 3、4 節。
