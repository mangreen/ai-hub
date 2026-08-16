# ADR-0001：以 Cordis 作為 Plugin Kernel

Date: 2026-08-16
Status: Accepted

## 背景
AI Hub 的非功能性需求要求「萬物皆插件、極致精簡輕量」。有兩個參考對象：
DeepSeek Harness（一個完整、但仍是 dev-preview 的 Agent Harness 產品），
以及它底層依賴的 Cordis（一個穩定多年、支撐 Koishi 專案的 TypeScript plugin meta-framework）。

## 決策
直接以 `cordis`（npm 套件，目前 4.0.0-rc.8）作為專案的 plugin kernel 依賴，
而不 fork 或 vendor DeepSeek Harness 的程式碼。

## 理由（Trade-off Analysis）

**Pros：**
- Cordis 本身穩定、文件成熟（Koishi 生態圈驗證多年），比 dsh 這種隨時可能 breaking change 的 dev-preview 專案可靠。
- Service + inject + 可逆掛載機制，剛好對應「聊天室動態開關某個 Agent 插件」的需求，不用自己刻一套 plugin 生命週期管理。
- Typed Events（emit/waterfall/parallel/serial）天生適合 Agent 之間非同步協作通訊（Phase 5 會大量用到）。

**Cons：**
- Cordis 生態圈的教學資源大多是中文/日文社群內容，英文資料相對少。
- 4.0 版本仍是 rc（release candidate），型別檔案在嚴格模式下有相容性坑（見 ERR-20260816）。
- 學習曲線：`Context`/`Service`/`inject`/`Fiber` 這套詞彙需要花時間建立心智模型。

**為何不直接用 dsh：**
dsh 是產品級 Agent Harness，功能遠超過我們現階段需要的（sandbox、subagent、typert RPC gateway 等）。
直接 fork 會導致我們在還沒搞懂 Cordis 基礎前就要啃一個大型 monorepo，違反 KISS 原則。
把它當「架構參考文件」讀，比把它的程式碼搬進來更符合學習目的。

## 影響
- 所有之後的 plugin（chat/agent/model/storage/marketplace）都要遵循 Cordis 的 plugin 慣例撰寫。
- tsconfig 需搭配 `Bundler` 解析模式（見 ERR-20260816），不能用 `NodeNext`。
