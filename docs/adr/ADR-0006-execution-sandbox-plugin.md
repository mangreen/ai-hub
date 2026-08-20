# ADR-0006：`sandboxed` 改名 `isolated`；新增可插拔的執行沙盒 `ctx.sandbox`

Date: 2026-08-19
Status: Accepted（設計定案，實作尚未開始，比照 ADR-0005 的節奏——先設計、你確認、才動手）

## 背景

兩件事：

1. `Room.sandboxed`（Phase 2 就有的欄位）名字取得不好——它講的其實是**記憶/可見性
   隔離**（哪些 agent 看得到哪個房間），跟資安領域「sandbox」慣常指的**執行環境
   隔離**（限制一段程式碼/指令能做什麼）完全是兩件事。兩個概念現在要同時存在於
   這個專案裡，繼續共用「sandbox」這個字一定會搞混。
2. 新功能：讓使用者可以**per-workflow** 選擇要不要用一個「sandbox 插件」——透過
   bwrap / Seatbelt / Landlock / Docker / 雲端 API 等後端——來執行 workflow 裡的
   所有動作。

## 決策 1：改名

`Room.sandboxed` → `Room.isolated`（`createRoom` 的參數、SQL 欄位
`sandboxed` → `isolated` 都一起改）。`AgentVisibility.canPeek` 維持不變
（它本來就沒有用到「sandbox」這個字，語意也還是對的）。改動範圍跟細節見
`memory/MEM-20260819-isolation-rename.md`；82 個測試全過，純 refactor，
沒有新增/改變任何行為。

「sandbox」這個詞現在保留給下面決策 2 的**執行隔離**概念，語意不再衝突。

## 決策 2：新增 `ctx.sandbox`——執行沙盒也是 registry pattern

跟 `ctx.model`/`ctx.channel`/`ctx.orchestrator`（ADR-0005）同一套：

```ts
interface SandboxExecutor {
  name: string   // 'seatbelt' | 'bwrap' | 'landlock' | 'docker' | 'cloud-api' | ...
  /** 這個後端在目前這台機器上實際能不能用（bwrap 只能在 Linux，Seatbelt 只能在 macOS）。*/
  isAvailable(): Promise<boolean>
  execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult>
}

interface SandboxExecutionRequest {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  // 資源限制、網路存取政策、檔案系統存取政策——實作時再細化
}

interface SandboxExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}
```

`WorkflowDefinition`（ADR-0005/ADR-0007 定義）新增一個欄位：
`sandboxExecutor: string | null`（要用哪個已註冊的 `ctx.sandbox` executor，
`null` = 不隔離、直接執行）。這是 workflow 層級的選擇，不是每個 node 分開選
（你的原話是「每個 workflow」，不是「每個 node」，先照這個範圍做，之後真的
需要 per-node 再擴充，YAGNI）。

## 五個後端的實際查證結果（不是照你列的順序照單全收，逐一查過）

| 後端 | 平台 | 現況 | 對這台開發機（2014 MacBook Pro / Big Sur）的意義 |
|---|---|---|---|
| **Seatbelt**（`sandbox-exec`） | macOS only | 被 Apple 標記 deprecated 已經好幾年，**但至今仍可用、仍有真正的 kernel 層級隔離**（查到具體案例：在 profile 限制下 `echo evil >> ~/.bashrc` 會被拒絕）。沒有官方替代方案。OpenAI 自己的 Codex CLI 現在都還在用它。 | **這台機器唯一原生可用、不用額外裝東西的選項**——優先實作、優先在本機測試。要在文件裡誠實寫清楚 deprecated 的風險，不要假裝它是「官方支援」的東西。 |
| **bwrap**（bubblewrap） | Linux only | 成熟穩定（Flatpak 底層用的就是它），namespace-based。 | 這台 Mac 上完全用不到，要測試得靠 Linux CI 或 VM。先寫 `isAvailable()` 回傳 `false`，介面留著，之後部署到 Linux 環境才會真的跑。 |
| **Landlock** | Linux kernel 5.13+ | 較新的 Linux kernel LSM，非特權程式也能用。 | 同 bwrap，這台機器用不到，留介面。 |
| **Docker** | 跨平台，需要 daemon | 這個專案在 Phase 0 就已經記錄過：Docker Desktop 新版不支援 Big Sur，需要 Colima/OrbStack（見 CLAUDE.md「環境限制」一節）。 | 不是不能用，但比 Seatbelt 多一層安裝/相容性摩擦，優先度排在 Seatbelt 之後。 |
| **雲端 API** | 跨平台，需要網路+key | 對應到像 E2B 這類託管沙盒服務——DeepSeek Harness 自己（Phase 0 研究過）就有一個 `e2b/` package 專門做這件事，openai-agents-js（ADR-0007 查過）也把 E2B 列在七個官方託管 provider 之一。 | 跟本機平台無關，隨時可用，但要花錢、要有網路。適合當「不管在哪台機器上都能用」的保底選項。 |

**結論：Phase 5.5（見下）實際會先動手做的是 Seatbelt（本機能測）+ 一個雲端 API
backend（平台無關、保底）。bwrap/Landlock 的 `SandboxExecutor` 介面現在就可以寫，
但函式本體先誠實回傳「這台機器不支援」，不硬做假的實作。**

## 這跟 activity_log（ADR-0005）的關係

`activity_log.kind` 新增一種：`'sandboxed_execution'`。`target` 記錄用了哪個
executor + 執行了什麼指令的摘要；`metadata` 記錄 exit code、是否逾時——**跟
ADR-0005 原本的安全 guardrail 一樣，metadata 絕對不記錄指令的完整 stdout/stderr
內容**（可能夾帶敏感資訊），只記錄「發生了什麼、花多久、成功與否」這個層級。

## 一個誠實的風險提醒（不是「不能做」，是「要做對」）

沙盒實作做錯比不做還危險——一個「看起來像沙盒但其實沒真的隔離」的東西，會讓人
誤以為執行是安全的，反而卸下戒心。查證 Seatbelt 的過程中，好幾個真實專案
（ai-jail、OpenCode 的沙盒實作）都特別強調「我們老實承認這個 gap 存在，而不是
假裝它不存在」——這個態度值得照抄。動手實作 Seatbelt profile 的時候：
- 一定要先寫測試證明「限制真的有生效」（例如測試「寫入 workspace 外的檔案會被拒絕」），
  不能只驗證「指令有跑起來」就算過關。
- Profile 設計錯誤比沒有 profile 更容易被誤信——這是 code review 時要特別注意的地方。

## 對 Phase 表的影響

- `ctx.sandbox` **registry 本身**（空殼，就是這份 ADR 定義的介面 + `isAvailable()`
  永遠誠實回報）成本很低，可以跟著 Phase 5 一起做。
- **具體後端實作（Seatbelt + 雲端 API）** 獨立成新的 **Phase 5.5**——理由：
  執行沙盒的使用情境是「Agent 呼叫工具/執行指令」，但這個專案目前**還沒有
  工具呼叫（tool calling）能力**，Phase 5 的 `task-graph` 策略目前只會做
  model 呼叫，不會執行任意指令。沒有 tool calling，`ctx.sandbox` 的
  executor 沒有真正的呼叫方——先把介面定義好（Phase 5），實際後端等
  Phase 5.5（可能跟 tool calling 一起設計）再做，避免蓋一個暫時沒有人用的東西
  （YAGNI 的另一種體現：介面便宜先定，實作等真的有呼叫方再做）。
- CLAUDE.md 的 Phase 5 段落、架構圖已更新反映這個決定。

## Trade-off Analysis

**Pros：**
- 命名不再衝突，之後看文件/程式碼不會搞混「隔離」指的是哪一種。
- `ctx.sandbox` 用跟其他三個 registry 一致的 pattern，學習成本低，Cordis 的
  「萬物皆插件」在這裡是第四次驗證。
- Seatbelt 的查證讓我們對「在這台機器上第一個要做的後端是什麼」有實證依據，
  不是憑感覺猜。

**Cons：**
- Seatbelt deprecated 是真實風險，沒有官方替代方案——這個依賴需要在文件裡持續
  追蹤，Apple 哪天真的拿掉它，需要重新評估（但因為是走我們自己的
  `SandboxExecutor` 介面，屆時只要換掉/新增一個 executor，不用重寫呼叫端邏輯）。
- bwrap/Landlock 在這台機器上完全沒辦法實測，只能先寫介面、之後找 Linux 環境
  （CI 或 VM）才能真的驗證行為正確——先承認這個限制，不假裝現在就驗證過。
