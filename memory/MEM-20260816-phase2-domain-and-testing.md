# MEM: Phase 2 — Domain 層與測試工具選擇
Date: 2026-08-16
Tags: [domain, tdd, testing]

## Summary
Room/Message/Agent/TaskAssignment 的純函式邏輯 + sandbox 可見性規則已完成，27 個測試全過，
`domain.ts` 兩個檔案皆 100% line/branch/func coverage。測試工具選用 Node 內建 `node:test`，
不用 vitest/jest。

## Details

**為什麼是 `node:test` 而不是 vitest：**
vitest 底層一樣依賴 esbuild/vite 做轉譯，而我們已經在 Phase 0 因為 esbuild native binary
在 Big Sur 上跑不動吃過一次虧（見 `error/ERR-20260816-esbuild-bigsur-incompatible.md`）。
既然專案已經確定走「Node 原生執行、不碰 native binary 工具」這條路，測試工具也應該一致，
不要為了測試又重新引入同一種風險。`node --test` 完全原生，不需要任何 devDependency。

**用法上的一個小坑：** `node --test src` 不會自動遞迴掃描資料夾找 `*.test.ts`
（會被當成單一 module path 解析，直接報 `MODULE_NOT_FOUND`）。正確寫法要用明確的 glob
字串：`node --test "src/**/*.test.ts"`（字串要加引號，讓 Node 自己展開，不要讓 shell 展開）。
已經寫進 `package.json` 的 `test` script。

**Sandbox 可見性規則（`chat/domain.ts` 的 `canAgentViewRoom`）：**
member 永遠能看自己的房間；非 member 要 `!room.sandboxed && agent.canPeek` 兩個條件都成立
才能看。用真值表寫了 5 個測試案例涵蓋所有組合，符合 spec 裡「Mutation Testing Mindset」的要求
（改掉任何一個布林運算子，測試都應該會壞）。

**`chat/domain.ts` 的 `AgentVisibility` 為什麼不直接用 `agent/domain.ts` 的 `Agent` 型別：**
故意讓 chat 和 agent 兩個 domain 互不依賴（各自的 bounded context），`canAgentViewRoom` 只吃一個
最小的結構型別 `{ agentId, canPeek }`。之後 Phase 5 真的要把兩者接起來時，會需要一個明確的映射
`{ agentId: agent.id, canPeek: agent.canPeek }`——這是刻意的，不是忘記重構。

**兩個 `domain.ts` 都各自寫了一個 3 行的 `assertNonBlank`，沒有抽共用 function。**
Rule of three：只重複一次、又只有 3 行，抽出來的耦合成本比重複的成本還高，先不做。

## When to Use
Phase 3 寫 model provider 的 integration test、Phase 4 寫 storage 的 integration test 時，
一樣用 `node:test`，一樣用 glob pattern 跑（不要假設資料夾自動遞迴）。
