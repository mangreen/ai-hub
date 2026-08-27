# MEM: 兩個真的在使用者的 Mac 上發現的問題 — 測試設計缺陷 + Seatbelt symlink bug
Date: 2026-08-21
Tags: [seatbelt, macos, realpath, testing]

## Summary
`pnpm verify:seatbelt`/`pnpm verify:docker` 交給使用者在真實 Mac 上跑之後，真的抓到
兩個問題：(1) 一個測試本身設計錯誤（把「這台開發機是 Linux」寫死成測試斷言）、
(2) SeatbeltExecutor 有一個真實的 macOS symlink bug，導致 workspace 內的寫入
被誤判為 workspace 外而遭拒絕。Docker executor 四項全過，沒有對應問題。

## Details

**問題 1（測試設計缺陷，不是實作 bug）：** `should_report_false_on_this_non_darwin_platform`
這個測試名字就寫死了「在非 darwin 平台上」的假設，直接斷言 `isAvailable()` 回傳
`false`。這在 Linux 上測試時「剛好」是對的（因為當時的開發機是 Linux），但這其實
是把「哪台機器在跑測試」錯當成「程式邏輯本身」在測——使用者在真正的 Mac 上跑
`pnpm test` 時，`isAvailable()` 正確回傳 `true`（因為程式邏輯本身完全正確：
`process.platform === 'darwin'`），但測試斷言寫死要 `false`，於是測試失敗，
即使實作沒有任何問題。

**修法：** 把 `isAvailable()` 依賴的平台判斷改成可注入（`platformImpl`，預設
`process.platform`），測試改成兩個決定性案例：`platformImpl: 'darwin'` 應該回
`true`、`platformImpl: 'linux'` 應該回 `false`——不管測試在哪台機器上跑，
結果都一樣，不再有「這個測試只在特定平台上才會過」的問題。

**問題 2（真的 bug，只有在真實 macOS 上跑才抓得到）：** macOS 的 `/tmp` 是
`/private/tmp` 的 symlink，`/var` 是 `/private/var` 的 symlink——`os.tmpdir()`
在 macOS 上回傳的路徑（範例：`/var/folders/d7/.../T/...`）是走 symlink 別名，
不是解析過的真實路徑。但 `sandbox-exec` 的 SBPL `(subpath "...")` 判斷，比對的
是**解析過的真實路徑**，不是 symlink 別名——所以我們原本 `buildSeatbeltProfile()`
用未解析的 `workspaceDir` 產生的 `(allow file-write* (subpath "/var/folders/..."))`
規則，永遠不會真的匹配到（因為程式實際寫入時走的是 `/private/var/folders/...`），
於是連 workspace 內的正常寫入都被 `(deny default)` 擋下來——使用者實測結果完全
印證這個推論：手動在路徑前面加 `/private/` 之後，同一個腳本就變成 PASS。

**修法：** `SeatbeltConfig` 新增 `realpathImpl`（預設 `fs.realpathSync`），
`runViaSeatbelt()` 在組 profile 跟決定 `cwd` 之前，先把 `workspaceDir` 解析成
真實路徑。`buildSeatbeltProfile()` 本身維持純函式不變（不做任何 I/O，不呼叫
`realpathSync`），因為它的測試用的是不存在於真實磁碟上的假路徑字串
（`realpathSync` 對不存在的路徑會直接 throw）——路徑解析只在 `runViaSeatbelt()`
（本來就會做真實 I/O 的地方）進行，職責分得很清楚。測試用 injectable
`realpathImpl` 模擬 macOS 的 symlink 解析行為（例如 `(p) => '/private' + p`），
不需要真的在 macOS 上跑就能驗證這個邏輯是對的。

**驗證腳本本身也有一個小問題連帶修掉：** 「可以讀取任意檔案」這個檢查原本用
`/etc/hostname`，這個檔案在 Linux 上幾乎必定存在，但 macOS 不保證有（實測也真的
FAIL 了，但原因很可能只是檔案不存在，不是 sandbox 的問題——`(allow file-read*)`
沒有任何路徑限制，理論上不該受 symlink 問題影響）。改成腳本自己在 workspace 外
建立一個內容已知的檔案，再驗證讀得到，不依賴任何特定作業系統內建的檔案。

## When to Use
- 任何測試斷言如果會因為「哪台機器在跑」而改變預期結果，這是測試設計的警訊——
  把那個會變動的東西（這裡是 platform）改成可注入，讓測試本身的斷言在任何機器上
  都是決定性的。
- 任何要在 SBPL/檔案系統路徑比對的地方，記得 macOS 的 `/tmp`、`/var`、`/etc`
  都是 symlink——只要程式碼會把「使用者/系統給的路徑」直接塞進路徑比對規則
  （不管是 SBPL、還是任何其他 allow-list 機制），都要先 `fs.realpathSync()`
  解析過，不能假設拿到的路徑已經是解析過的真實路徑。
- 這次的過程再次證明了 `scripts/verify-*.ts` 這類「必須在真實環境跑」的驗證腳本
  存在的意義——這兩個問題都是這個專案自己的（Linux）測試環境完全無法發現的，
  只有交給使用者在真實 Mac 上實測才抓得到。
