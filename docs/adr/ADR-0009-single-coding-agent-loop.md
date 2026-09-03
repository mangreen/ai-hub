# ADR-0009：先完成 Single Coding Agent，再擴充 Multi-Agent Orchestrator

Date: 2026-08-24
Status: Accepted

## 背景

Phase 5 的 `task-graph` 已經能執行「事先定義好的 agent nodes」，但這不是 coding agent。

coding 任務的核心控制迴圈不是：

`workflow DAG → node → model → message`

而是：

`user prompt → inspect workspace → decide next action → tool → observe result → decide again → verify → finish`

如果沒有這個 loop，manager-agent / multi-agent 只是在把一個沒有手腳的模型分派給更多模型，仍然無法把
`請在 ./url_short/ 完成一個專案` 轉成實際存在、可執行、經過驗證的 source tree。

## 決策

新增 `coding-agent` orchestration strategy，保留既有 `task-graph` 不動。

`OrchestrationStrategy` 增加 optional `runTask(request)`，讓策略可以接受 free-form prompt，而不必先建立
DAG。

新增 `ctx.tool` registry：

- `list_files`
- `read_file`
- `search_files`
- `write_file`
- `run_command`

tool plugin 不直接暴露整個 process filesystem；coding task 先解析 workspace，再限制 path 在 AI Hub
process cwd 以下。`run_command` 不使用 shell string，而是 executable + argv，避免把「任意 shell injection」
直接放進模型介面。

原本：

```bash
# src/plugins/orchestrator/task-graph/

User
  ↓
Workflow DAG
  ↓
TaskNode
  ↓
Model
  ↓
回訊息
```

現在新增：

```bash
# src/plugins/orchestrator/coding-agent/

User
  ↓
coding-agent strategy
  ↓
分析 workspace
  ↓
┌─────────────────────────────┐
│ Model                       │
│   ↓                         │
│ tool decision               │
│   ↓                         │
│ read / search / write       │
│   ↓                         │
│ run_command                 │
│   ↓                         │
│ observe result              │
│   ↓                         │
│ diagnose / repair           │
│   ↓                         │
│ verify                      │
│   ↓                         │
│ final                       │
└─────────────────────────────┘
  ↓
./url_short/ 完成
```

OrchestrationStrategy 現在支援：

```ts
runWorkflow(...)
runTask(...)
```

## Model / Tool protocol

因為既有 `ModelProvider` 只有：

```ts
complete(messages, model)
```

這一階段不綁任何 provider 的原生 tool-calling API。

model 必須回傳單一 JSON：

```json
{"action":"tool","tool":"read_file","arguments":{"path":"package.json"}}
```

或：

```json
{"action":"final","content":"Implemented and verified the project."}
```

strategy 執行 tool，把結果再寫回 conversation，繼續下一輪。

這讓 OpenAI、Claude、Gemini、Grok、NVIDIA、OpenRouter、Ollama 都可以共用同一個 orchestration loop。
之後若要接 provider-native tool calling，可以只替換 model adapter / strategy protocol，不需要重寫 tool
plugin。

新增：

```bash
ctx.tool
├── list_files
├── read_file
├── search_files
├── write_file
└── run_command
```

```bash
src/plugins/tool/
src/plugins/tool/filesystem/
src/plugins/tool/shell/
```

## 執行安全

filesystem tool 永遠以 `workspaceRoot` 為 root，拒絕 path traversal。

`run_command` 只透過 `ctx.sandbox`：

- 預設 `allowNetwork=false`
- dependency installation 等需要網路的操作必須由 agent 明確要求 `allowNetwork=true`
- Docker 使用 `--network none` / `--network bridge`
- Seatbelt 預設 deny network，顯式允許時加入 network rule

sandbox 是 execution boundary；tool registry 本身不假裝提供安全隔離。

## 為什麼現在不做 Multi-Agent

在 single-agent loop 尚未能穩定完成：

1. repository discovery
2. code generation / modification
3. test execution
4. failure diagnosis
5. repair
6. final verification

之前加入 manager-agent / DAG / parallel worker，只會把上述缺口複製到多個 agent。

下一階段才適合把這個 loop 包成 worker，再讓 manager-agent 負責拆分任務、分配 workspace scope、
合併結果與最終驗證。

## 測試流程

新增：

```ts
scripts/verify-real-coding-agent.ts
```

執行方式:

調整最大 agent steps 及設定 provider 的 key

```bash
AI_HUB_REAL_CODING_MAX_STEPS=32 \ 
OPENROUTER_API_KEY="sk-or-v1-xxxxxxxx" \
pnpm verify:real-coding-agent
```

執行失敗時，.tmp/url_short/ 會保留，方便你直接檢查 agent 做到哪一步。

```bash
                    Host
                     │
                     │ HTTPS
                     ▼
             OpenRouter API
                     │
       cohere/north-mini-code:free
                     │
                     ▼
             coding-agent loop
                     │
          ┌──────────┴──────────┐
          │                     │
    filesystem tools       run_command
          │                     │
          ▼                     ▼
   .tmp/url_short/        Docker sandbox
                                │
                        only mount .tmp/url_short/
                                │
                        npm install / test
                        typecheck / build
```
