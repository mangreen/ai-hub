# AI Hub

多 Agent 聊天協作平台 — 學習型開發專案。架構規範見 [`CLAUDE.md`](./CLAUDE.md)。

## 目前狀態：Phase 0 — 環境與 Cordis 基礎 ✅

- Plugin kernel：[`cordis`](https://github.com/cordiverse/cordis)
- Runtime：Node.js 內建 TypeScript type-stripping 直接執行 `.ts`，無編譯步驟、無 esbuild 依賴
  （原本用 `tsx`，但其依賴的 `esbuild` native binary 不支援 macOS Big Sur，見 `error/ERR-20260816-esbuild-bigsur-incompatible.md`）
- Package manager：pnpm

## 快速開始

```bash
pnpm install
pnpm start        # 跑一次 Phase 0 的 hello-plugin 範例（node src/index.ts）
pnpm dev          # watch 模式（node --watch src/index.ts）
pnpm typecheck    # 靜態型別檢查
```

預期輸出：

```
--- AI Hub kernel booted (Phase 0) ---
[event] Allen -> Ben: frontend contract is ready
Hello, world! (from GreeterService)
```

## Phase 0 涵蓋的 Cordis 概念

| 檔案 | 示範概念 |
|---|---|
| `src/plugins/greeter.ts` | Service 寫法：`class extends Service` + `declare module` 型別合併 |
| `src/plugins/consumer.ts` | `inject` 宣告依賴，Cordis 保證載入順序 |
| `src/plugins/event-demo.ts` | `ctx.on` / `ctx.emit`，Phase 5 多 Agent 通訊的基礎 |
| `src/index.ts` | Root `Context` 建立 + `ctx.plugin()` 掛載 |

## 已知的坑

見 [`error/ERR-20260816-cordis-nodenext-imports.md`](./error/ERR-20260816-cordis-nodenext-imports.md)：
tsconfig 必須用 `moduleResolution: "Bundler"`，不能用 `NodeNext`（cordis rc 版型別檔案的相容性問題）。

## 目錄結構

完整結構與各階段規劃見 [`CLAUDE.md`](./CLAUDE.md) 第 3、4 節。
