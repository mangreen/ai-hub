# ADR-0008：Phase 5.5 實作 — Seatbelt + Docker executor，E2B 延後

Date: 2026-08-21
Status: Accepted（實作已完成，未在真實 macOS/Docker 環境驗證——見下方「已知限制」）

## 背景

ADR-0006 定義了 `ctx.sandbox` 的介面跟五個候選後端，但沒有動手實作。這次要做：
1. Seatbelt（macOS `sandbox-exec`）——ADR-0006 原本就排序第一優先。
2. **Docker**——你確認本機已經裝了可用的 Docker Desktop 4.12.0（Engine 20.10.17），
   原本規劃外新增的一項。
3. 雲端 API（例如 E2B）——**這次沒做**，原因見下方。

## 決策 1：一個重要澄清——這個 Phase 不需要等 tool calling

上一輪我自己在 todo.md 寫「這個 Phase 需要先有 tool calling」，這個說法不夠精確，
這次動手前先更正：`SandboxExecutor.execute(request)` 本身就是一個完整、通用的
「執行一個指令並回傳結果」介面，跟「誰會呼叫它」無關。**能不能建造、能不能驗證
executor 本身正確，跟 tool calling 存不存在是兩件事**——tool calling 只決定
「workflow 執行到某個 node 時，要不要把它要做的動作路由進 sandbox」，那是接線的
問題，不是 executor 本身能否成立的問題。所以這次直接動手做 executor 本身，
「接進 `task-graph` 策略」留給 tool calling 真的設計出來的時候再做。

## 決策 2：Docker Desktop 4.12.0（Engine 20.10.17）足夠用

查證：Docker 的 `--network none`、bind mount（`-v`）、資源限制（`--memory`/`--cpus`）
都是 Docker Engine 非常早期就穩定的功能（2016-2017 年就有），Engine 20.10.17
完全涵蓋我們需要的基本能力，不需要升級 Docker Desktop、也不需要 Colima/OrbStack
這條路（CLAUDE.md Section 0 原本記錄的「Docker Desktop 不支援 Big Sur」問題，
在「你已經有一個能跑的舊版 Docker Desktop」這個前提下根本不成立——這個顧慮是
假設要「重新安裝」新版 Docker 才會遇到，你既有的安裝不受影響）。

## 決策 3：兩個 executor 的實作邊界——「指令怎麼組」是純函式，「怎麼執行」用 injectable spawn

跟這個專案從 Phase 3 就建立的「injectable I/O」模式一致（Phase 3 用 injectable
`fetch`，這裡用 injectable `spawn`）：

- `buildSeatbeltProfile(workspaceDir)` / `buildDockerArgs(config, request)`——
  純函式，回傳 SBPL 文字 / `docker run` 參數陣列，跟真的有沒有 `sandbox-exec`/
  `docker` 完全無關，可以在任何機器上完整測試。
- `execute()`——透過 `spawnImpl`（預設是 `node:child_process` 的真實 `spawn`）
  執行，測試用假的 spawn function 驗證「呼叫的指令/參數/選項對不對」，不驗證
  「真的執行後隔離有沒有生效」。

**這次開發機是 Linux，兩個都無法在這台機器上實際跑起來驗證**（`docker`/
`sandbox-exec` 都不存在）——這點在程式碼跟這份 ADR 裡都要老實寫清楚，不要讓
「測試都過了」造成「隔離一定有效」的錯覺。

## 決策 4：Seatbelt profile 的具體設計（查證來源：Anthropic 自己的 sandbox-runtime）

查了 Anthropic 自己的 production 專案
[`anthropic-experimental/sandbox-runtime`](https://deepwiki.com/anthropic-experimental/sandbox-runtime/6.2-macos-sandboxing)——
它也是用 `sandbox-exec -p <profile>` 這個 CLI 模式，profile 結構是
「deny-by-default → 明確 allow-list → 針對危險路徑的強制 deny（即使在 allow-list
範圍內）」。我們的 v1 版本照這個模式簡化：

```scheme
(version 1)
(deny default)
(allow process-fork)
(allow process-exec)
(allow file-read*)
(allow file-write* (subpath "<workspaceDir>"))
(deny file-write* (subpath "<workspaceDir>/.git/hooks"))
(deny file-write* (literal "<workspaceDir>/.git/config"))
```

**已知限制（誠實列出，不是藏起來）：**
- 網路沒有明確 allow，所以被 `(deny default)` 擋掉——需要網路的指令這個版本不支援。
- 沒有做 Anthropic 版本特別處理的「file-write-unlink bypass」防護（用 `mv`/rename
  繞過寫入限制的手法）——真實存在的 gap，不是忽略了才沒寫。
- 沒有他們的 violation log 監控機制（透過 `log stream` 關聯違規跟指令）。

## 決策 5：Docker 的隔離設計 vs Seatbelt

```bash
docker run --rm --network none --memory 512m --cpus 1 \
  -v "<workspaceDir>:/workspace" -w /workspace \
  <image> <command> <args...>
```

跟 Seatbelt 的路徑規則式隔離不同，Docker 是整個 filesystem/network namespace
交換——粒度更粗，但也因此**不會有 Seatbelt 那種「規則寫錯造成的細節漏洞」**
（例如 file-write-unlink bypass 這類問題在 Docker 底下不存在對應的攻擊面，
因為容器內完全沒有 host 的路徑可以拿來 rename）。已知限制：容器自己的檔案系統
（來自 image，不是 host）預設可寫——這次沒加 `--read-only`，因為 `--rm` 會讓這些
寫入隨容器一起消失，對 v1 是可接受的取捨。

## 決策 6：E2B 雲端 executor 延後，不是取消

上一輪已經查過 E2B 的 SDK（`e2b` npm package，`Sandbox.create()` +
`sandbox.commands.run()`），這次確認它是純 JS/TS 依賴（`npm install e2b`
沒有觸發任何 native binary 編譯，符合這個專案「避開 native binary」的一貫原則，
理論上可以放心採用）。**這次沒做的原因是範圍考量，不是技術問題**：Seatbelt +
Docker 兩個本機選項已經是這次的合理範圍；E2B 需要真的申請帳號 + API key
才能做任何有意義的驗證（連 mock 測試都需要先弄清楚它的 wire protocol，
上一輪只查了 SDK 表面用法，沒有查到底層 HTTP/gRPC 細節）——這些都留到之後
真的需要「不管在哪台機器上都能跑的保底選項」時再做。

## Trade-off Analysis

**Pros：**
- Seatbelt + Docker 都用同一套「純函式建構 + injectable spawn」模式，跟 Phase 3
  的 model client 完全一致，學習成本低。
- Docker 的隔離設計比 Seatbelt 更不容易在「規則寫錯」上出包（粒度粗但邊界清楚）。
- 兩個 executor 都附了在你自己機器上跑的驗證腳本（`scripts/verify-seatbelt.ts`、
  `scripts/verify-docker.ts`），不是只交出「測試都綠燈」就算數。

**Cons：**
- 兩個 executor 都還沒在真實環境驗證過——這是這次最大的風險，已經用驗證腳本
  跟文件裡的「已知限制」清楚標注，但風險本身沒有消失，需要你實際跑一次
  `pnpm verify:seatbelt`（在你的 Mac 上）跟 `pnpm verify:docker` 才算真正確認。
- Seatbelt 的 file-write-unlink bypass 是真的資安 gap，如果之後這個 sandbox
  真的要拿來執行不受信任的 AI 產生的指令，這個 gap 要在正式使用前補上。

## 影響

- `package.json` 新增 `verify:seatbelt`/`verify:docker` script。
- `tsconfig.json` 的 `include` 加上 `scripts`，這兩個驗證腳本才會被型別檢查。
- 架構圖、CLAUDE.md 已更新反映這兩個 executor 從「規劃中」變成「已實作（未在真實
  環境驗證）」。

## 補充（2026-08-21，你實際在 Mac 上跑過驗證腳本之後）

「Cons」欄位講的風險，這次真的兌現了一個：`pnpm verify:seatbelt` 第一次跑
（在改動前的版本）4 項裡有 2 項 FAIL，包括最基本的「可以寫入 workspace 內」都不過。
根因是 macOS 的 `/tmp`/`/var` 是 symlink，`sandbox-exec` 的路徑比對用的是解析過的
真實路徑，我們原本沒有解析就直接塞進 SBPL profile。已修正（`SeatbeltConfig` 新增
`realpathImpl`，預設用 `fs.realpathSync()`），完整過程見
`memory/MEM-20260821-seatbelt-realpath-fix.md`。同時也發現一個測試本身寫死了
「這台開發機是 Linux」的假設，在真的 Mac 上跑就會誤判失敗——已改成 injectable
`platformImpl`，兩種平台的行為都能決定性地測試，不管在哪台機器上跑測試結果都一樣。

**Docker executor 四項全過，沒有對應問題**——這符合決策 5 的預期（Docker 的
namespace 級隔離比 Seatbelt 的路徑規則式隔離更不容易在細節上出包）。

這證明了「先寫測試證明限制真的有生效」（ADR-0006 的原則）光靠這個專案自己的
（Linux）測試環境是不夠的——`pnpm test` 全綠不等於隔離真的有效，`scripts/verify-*.ts`
在真實環境上的結果才是最終判準，這次的經驗印證了為什麼一開始就要把這兩者分開設計。
