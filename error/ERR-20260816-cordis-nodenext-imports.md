# ERR: tsconfig `moduleResolution: NodeNext` 與 cordis@4.0.0-rc.8 型別檔案不相容
Date: 2026-08-16
Severity: Medium

## Description
用 `moduleResolution: "NodeNext"`（搭配 `module: "NodeNext"`）執行 `pnpm typecheck` 時，出現一連串看似無關的錯誤：
`'Context' only refers to a type, but is being used as a value here`、
`Module '"cordis"' has no exported member 'Service'`、
`Property 'on'/'emit' does not exist on type 'Context'`。
但用 `tsx` 直接執行程式碼完全正常，只有靜態型別檢查會炸。

## Root Cause
`cordis@4.0.0-rc.8` 內建的 `.d.ts` 檔案（例如 `lib/index.d.ts`）用的是**沒有副檔名**的相對匯入，
例如 `export * from './context'`，而不是 `export * from './context.js'`。
`NodeNext` 解析模式要求 ECMAScript 相對匯入必須帶明確副檔名，一旦不符合，
TypeScript 會直接讓那幾行 `export *` 失效，導致整個套件的型別匯出（`Context` 的 class 部分、`Service`、
`ctx.on/emit` 等）在型別系統裡消失，即使實際程式碼完全沒問題。

## Solution
把 tsconfig 的 `module`/`moduleResolution` 改成 `"ESNext"` / `"Bundler"`（不要用 `NodeNext`）。
`Bundler` 解析模式本來就不要求明確副檔名，剛好也符合我們用 `tsx`（esbuild）執行、不用 `tsc` 編譯產出的實際情況。

## Prevention
- 之後遇到「執行正常但 `tsc --noEmit` 報一堆看似不相關的匯出錯誤」，第一個懷疑對象是
  **依賴套件本身的 `.d.ts` 檔案是否相容目前的 `moduleResolution`**，尤其是 `-rc` / 預覽版套件。
  用 `tsc --noEmit --skipLibCheck false` 可以讓 TypeScript 把套件內部的型別檔案錯誤也印出來，
  比只看自己程式碼的報錯快很多。
- 只要專案是用 `tsx`/`esbuild`/`vite` 之類的工具跑程式（而不是直接用 `tsc` 編譯後跑 Node），
  tsconfig 幾乎都該用 `Bundler` 解析模式，`NodeNext` 主要是給「純 `tsc` 編譯 + Node 原生執行」的場景用的。
