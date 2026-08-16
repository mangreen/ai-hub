# ERR: `esbuild`（透過 `tsx`）在 macOS Big Sur 上 postinstall 失敗
Date: 2026-08-16
Severity: High

## Description
在 macOS Big Sur (11.7.11) 上執行 `pnpm install` 時，`esbuild@0.28.2` 的 postinstall script 失敗：

```
dyld: Symbol not found: _SecTrustCopyCertificateChain
  Referenced from: .../esbuild/bin/esbuild (which was built for Mac OS X 12.0)
  Expected in: /System/Library/Frameworks/Security.framework/Versions/A/Security
```

## Root Cause
`esbuild` 的 native binary 從某個版本起，最低部署目標（deployment target）設為 macOS 12.0（Monterey），
用到的 `_SecTrustCopyCertificateChain` symbol 是 macOS 12 才在 Security.framework 裡提供的。
Big Sur (11.x) 的系統 Security.framework 沒有這個 symbol，所以 binary 直接載入失敗（dyld 層級，不是 npm/pnpm 的問題）。
我們原本用 `tsx` 直接跑 `.ts` 檔案，而 `tsx` 內部依賴 `esbuild` 做轉譯，所以才間接踩到這個坑。

## Solution
完全移除 `tsx`（連帶移除 `esbuild`），改用 **Node.js 內建的 TypeScript type-stripping** 直接執行：

```bash
node src/index.ts          # 不需要任何 flag，Node 22.22+/22.23+ 已預設支援
node --watch src/index.ts  # 取代 tsx watch 模式
```

`package.json` 的 `dev`/`start` script 已改成上面這兩行。`tsc` 本身是純 JS/TypeScript 實作，
沒有 native binary，不受這個問題影響，所以 `pnpm typecheck` 從頭到尾都沒事。

## Prevention
- 這台開發機是 2014 年的 Mac，跑的是 Big Sur——**任何 devDependency 只要內建 native binary
  （esbuild、swc、napi 模組等），都有一定機率在這台機器上跟這個坑撞上**，之後導入新工具前先想一下
  這件事，能用 Node 內建能力就別加額外工具。
- 我們的程式碼本來就沒有用到 enum、namespace、decorator metadata 這類需要「轉換」而非單純「擦除」型別的
  TS 語法，所以 Node 原生 type-stripping 完全夠用；如果之後某個 Phase 真的需要這些語法，屆時再評估要不要
  局部引入編譯步驟（例如只用純 `tsc` 編譯輸出 `dist/`，而不是依賴 esbuild 系工具）。
