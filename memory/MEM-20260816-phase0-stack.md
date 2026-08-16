# MEM: Phase 0 技術選型 — Cordis + pnpm + tsx
Date: 2026-08-16
Tags: [kernel, cordis, tooling]

## Summary
AI Hub 的 plugin kernel 直接依賴官方 `cordis` npm 套件（非 vendor/fork），開發時用 `tsx` 直接跑 TypeScript，不經編譯步驟。

## Details
- 安裝 `cordis@4.0.0-rc.8`（截至 2026-08-16 的最新版）。這是一個穩定多年、支撐 Koishi 專案的 plugin meta-framework，不是 DeepSeek Harness 那種 dev-preview 專案。
- Plugin 三種寫法都支援：function `(ctx, config) => {}`、class（`extends Service`）、object（`{ apply(ctx) {} }`）。
- Service 註冊模式：`class Foo extends Service { constructor(ctx) { super(ctx, 'foo') } }` + `declare module 'cordis' { interface Context { foo: Foo } }` 做型別合併。
- 事件系統：`ctx.on/once/emit/parallel/serial/bail/waterfall`，這是 Phase 5 多 Agent 協作要用的通訊機制。
- **重要（已修訂）**：專案不用 `tsx`/`esbuild` 執行程式碼，改用 **Node.js 內建 TypeScript type-stripping**
  直接跑 `.ts` 檔案（`node src/index.ts`），`tsc` 只用來做 `pnpm typecheck` 靜態檢查。
  原因見 `error/ERR-20260816-esbuild-bigsur-incompatible.md`——`esbuild` native binary 不支援 Big Sur。
- 因此所有 relative import 都要**明確帶 `.ts` 副檔名**（例如 `from './plugins/greeter.ts'`），
  這是 Node ESM 原生 loader 的要求，跟 bundler 系工具（會自動補副檔名）不同。
- tsconfig 用 `moduleResolution: "Bundler"`（不是 `NodeNext`）+ `allowImportingTsExtensions: true`
  ——讓 `tsc` 的型別檢查跟 Node 實際的執行方式（帶 `.ts` 副檔名的 import）一致。
  另一半原因見 `error/ERR-20260816-cordis-nodenext-imports.md`（cordis rc 版型別檔案的相容性問題）。

## When to Use
之後任何新增的 Cordis plugin（Phase 2 起的 domain/model/storage 等）都照這個模式：function 或 class 皆可，需要暴露能力給其他 plugin 用時才用 Service + declare module。
