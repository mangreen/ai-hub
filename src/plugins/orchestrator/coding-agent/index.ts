import { Context } from 'cordis'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'
import type { ChatMessage, ChatCompletionResult } from '../../model/types.ts'
import type { WorkflowRunResult } from '../domain.ts'
import type { OrchestrationTaskRequest } from '../index.ts'
import type { ToolDefinition } from '../../tool/index.ts'

export const name = 'coding-agent-strategy'
export const inject = ['orchestrator', 'agent', 'model', 'chat', 'storage', 'tool']

export interface CodingTaskResult extends WorkflowRunResult {
  output?: string
}

interface AgentLike {
  id: string
  name: string
  modelRef: string
}

const DEFAULT_AGENT_ID = 'coding-agent'
const DEFAULT_MAX_STEPS = 32
const DEFAULT_MODEL_REF = 'openrouter:openai/gpt-4.1-mini'
const AGENT_SENDER = 'coding-agent'

export function apply(ctx: Context) {
  ctx.orchestrator.register({
    name: 'coding-agent',
    runWorkflow: async (definition) => {
      const node = definition.nodes[0]
      if (!node) throw new Error('coding-agent strategy requires at least one task node')
      return runCodingTask(ctx, {
        roomId: definition.roomId,
        prompt: node.task,
        agentId: node.agentId,
        workspaceRoot: extractWorkspaceRoot(node.task, process.cwd()),
        sandboxExecutor: definition.sandboxExecutor,
      })
    },
    runTask: (request: OrchestrationTaskRequest) => runCodingTask(ctx, request),
  })

  // This is the event-driven entry point the existing chat layer was missing:
  // a human message can start a coding task without first creating a workflow.
  ctx.on('chat/message', async (payload: { roomId: string; from: string; content: string }) => {
    const { roomId, from, content } = payload
    if (from === AGENT_SENDER || !looksLikeCodingRequest(content)) return
    try {
      await runCodingTask(ctx, {
        roomId,
        prompt: content,
        workspaceRoot: extractWorkspaceRoot(content, process.cwd()),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.chat.postMessage(randomUUID(), roomId, AGENT_SENDER, `coding-agent failed: ${message}`)
    }
  })
}

async function runCodingTask(ctx: Context, request: OrchestrationTaskRequest): Promise<CodingTaskResult> {
  const workspaceRoot = resolveWorkspace(request.workspaceRoot ?? extractWorkspaceRoot(request.prompt, process.cwd()))
  mkdirSync(workspaceRoot, { recursive: true })

  const agent = ensureAgent(ctx, request.agentId ?? process.env.AI_HUB_CODING_AGENT_ID ?? DEFAULT_AGENT_ID)
  const modelRef = agent.modelRef
  const parsed = parseModelRef(modelRef)
  const provider = ctx.model.get(parsed.provider)
  if (!provider) throw new Error(`model provider "${parsed.provider}" is not registered`)

  const workflowId = randomUUID()
  const workflow = ctx.orchestrator.createWorkflow({
    id: workflowId,
    name: `Coding task: ${request.prompt.slice(0, 80)}`,
    roomId: request.roomId,
    nodes: [{ id: 'coding-task', agentId: agent.id, task: request.prompt }],
    edges: [],
    sandboxExecutor: request.sandboxExecutor ?? null,
  })

  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  ctx.storage.run(
    'INSERT INTO workflow_runs (id, workflow_id, status, started_at, finished_at) VALUES (?, ?, ?, ?, ?)',
    [runId, workflow.id, 'running', startedAt, null],
  )
  const nodeRunId = randomUUID()
  ctx.storage.run(
    'INSERT INTO task_node_runs (id, run_id, node_id, agent_id, status, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [nodeRunId, runId, 'coding-task', agent.id, 'running', startedAt, null],
  )

  ctx.emit('agent/task-assigned', { from: 'orchestrator', to: agent.id, task: request.prompt })

  const maxSteps = clamp(request.maxSteps ?? Number(process.env.AI_HUB_CODING_MAX_STEPS ?? DEFAULT_MAX_STEPS), 1, 100)
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(workspaceRoot, ctx.tool.list()) },
    { role: 'user', content: request.prompt },
  ]

  let finalOutput = ''
  let hasSuccessfulCommand = false
  try {
    for (let step = 1; step <= maxSteps; step++) {
      const activityId = randomUUID()
      const startedMs = Date.now()
      ctx.storage.run(
        'INSERT INTO activity_log (id, workflow_run_id, task_node_run_id, agent_id, kind, target, started_at, finished_at, duration_ms, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [activityId, runId, nodeRunId, agent.id, 'model_call', `${parsed.provider}:${parsed.model}`, new Date(startedMs).toISOString(), null, null, 'running', JSON.stringify({ step })],
      )

      let completion: ChatCompletionResult
      try {
        completion = await provider.complete(messages, parsed.model)
      } catch (error) {
        markActivityFailed(ctx, activityId, startedMs)
        throw error
      }
      markActivitySucceeded(ctx, activityId, startedMs)
      messages.push({ role: 'assistant', content: completion.content })

      const decision = parseAgentDecision(completion.content)
      if (decision.kind === 'final') {
        if (!hasSuccessfulCommand) {
          messages.push({
            role: 'user',
            content: 'Before finishing, you must use run_command successfully to verify the implementation (for example a test, typecheck, build, or other executable check). Do not provide the final response yet.',
          })
          continue
        }
        finalOutput = decision.content
        break
      }

      let toolResult
      const toolActivityId = randomUUID()
      const toolStartedMs = Date.now()
      ctx.storage.run(
        'INSERT INTO activity_log (id, workflow_run_id, task_node_run_id, agent_id, kind, target, started_at, finished_at, duration_ms, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [toolActivityId, runId, nodeRunId, agent.id, 'tool_call', decision.tool, new Date(toolStartedMs).toISOString(), null, null, 'running', JSON.stringify({ step })],
      )
      try {
        toolResult = await ctx.tool.execute(decision.tool, decision.arguments, {
          workspaceRoot,
          sandboxExecutor: request.sandboxExecutor,
        })
        if (toolResult.isError) {
          markActivityFailed(ctx, toolActivityId, toolStartedMs)
        } else {
          markActivitySucceeded(ctx, toolActivityId, toolStartedMs)
          if (decision.tool === 'run_command') hasSuccessfulCommand = true
        }
      } catch (error) {
        markActivityFailed(ctx, toolActivityId, toolStartedMs)
        toolResult = { content: `tool error: ${error instanceof Error ? error.message : String(error)}`, isError: true }
      }

      messages.push({
        role: 'user',
        content: `TOOL_RESULT ${decision.tool}\n${toolResult.isError ? 'ERROR\n' : ''}${truncate(toolResult.content, 12000)}`,
      })
    }

    if (!finalOutput) {
      throw new Error(`coding-agent reached the maximum step limit (${maxSteps}) before completing and verifying the task`)
    }

    const finishedAt = new Date().toISOString()
    ctx.storage.run('UPDATE task_node_runs SET status = ?, finished_at = ? WHERE id = ?', ['succeeded', finishedAt, nodeRunId])
    ctx.storage.run('UPDATE workflow_runs SET status = ?, finished_at = ? WHERE id = ?', ['succeeded', finishedAt, runId])
    ctx.chat.postMessage(randomUUID(), request.roomId, AGENT_SENDER, finalOutput)
    return { runId, status: 'succeeded', output: finalOutput }
  } catch (error) {
    const finishedAt = new Date().toISOString()
    ctx.storage.run('UPDATE task_node_runs SET status = ?, finished_at = ? WHERE id = ?', ['failed', finishedAt, nodeRunId])
    ctx.storage.run('UPDATE workflow_runs SET status = ?, finished_at = ? WHERE id = ?', ['failed', finishedAt, runId])
    throw error
  }
}

function ensureAgent(ctx: Context, requestedId: string): AgentLike {
  const existing = ctx.agent.getAgent(requestedId)
  if (existing) return existing

  const modelRef = process.env.AI_HUB_CODING_MODEL_REF ?? DEFAULT_MODEL_REF
  try {
    return ctx.agent.createAgent(requestedId, 'Coding Agent', modelRef)
  } catch (error) {
    const raced = ctx.agent.getAgent(requestedId)
    if (raced) return raced
    throw error
  }
}

function buildSystemPrompt(workspaceRoot: string, tools: ToolDefinition[]): string {
  const toolDocs = tools.map((tool) => JSON.stringify({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  })).join('\n')

  return `You are a software engineer operating an actual repository workspace.

WORKSPACE:
${workspaceRoot}

Your job is to turn the user's request into a working project inside that workspace. Inspect the existing repository before making assumptions. Implement the smallest complete solution, preserve existing architecture when possible, and verify your work by running tests or executable checks. When a check fails, diagnose it and edit the code until it passes.

Your response must be a single, valid JSON object with no additional text, spaces, or newlines outside the JSON. For example:
{"action":"tool","tool":"list_files","arguments":{"path":"."}}
or
{"action":"final","content":"All tests passed."}

Do not use markdown fences around the JSON. Do not claim a file was created or a test passed unless a tool result proves it. Prefer multiple focused edits over speculative rewrites.

If a tool returns an error, analyze the error message, adjust arguments or code, and retry. Do not assume success.

Recommended workflow:
1. Use "list_files' or "read_file" to explore the current workspace.
2. Plan the minimal changes needed.
3. Implement changes using "write_file" or "edit_file".
4. Run tests/checks via "execute_command" and interpret results.
5. If a test fails, diagnose and revise, then repeat verification.
6. Only respond with "final" when all checks pass and the user's request is satisfied.

AVAILABLE TOOLS:
${toolDocs}`
}

type AgentDecision =
  | { kind: 'tool'; tool: string; arguments: Record<string, unknown> }
  | { kind: 'final'; content: string }

function cleanJSON(content: string): string {
  // 去除首尾空白
  let cleaned = content.trim();

  // 移除結尾逗號（例如 { "a": 1, } 中的逗號）
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  // 若已是合法 JSON，直接回傳
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    // 否則逐步移除尾端可能多餘的分隔符
    let attempt = cleaned;
    let safety = 1000; // 避免無窮迴圈
    while (attempt.length > 0 && safety-- > 0) {
      attempt = attempt.trimEnd();
      const lastChar = attempt[attempt.length - 1];
      // 只移除可能是多餘的結尾字元：} ] , 或空白
      if (lastChar === '}' || lastChar === ']' || lastChar === ',') {
        attempt = attempt.slice(0, -1);
        try {
          JSON.parse(attempt);
          return attempt; // 成功修復
        } catch {
          continue;
        }
      } else {
        break;
      }
    }
    // 若仍無法修復，拋出錯誤（或可回傳原始字串，依需求）
    throw new Error(`Unable to clean JSON: ${content.slice(0, 500)}`);
  }
}

function parseAgentDecision(content: string): AgentDecision {
  console.log("============>", content, "<============")
  //const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').replace(/\s*}*]\s*$/, '')
  const cleaned = cleanJSON(content)
  let value: unknown
  try {
    value = JSON.parse(cleaned)
  } catch {
    throw new Error(`coding-agent returned invalid JSON: ${truncate(content, 500)}`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('coding-agent decision must be an object')
  const object = value as Record<string, unknown>
  if (object.action === 'final' && typeof object.content === 'string') {
    return { kind: 'final', content: object.content }
  }
  if (object.action === 'tool' && typeof object.tool === 'string' && isRecord(object.arguments)) {
    return { kind: 'tool', tool: object.tool, arguments: object.arguments }
  }
  throw new Error('coding-agent decision must be {action:"tool",tool,arguments} or {action:"final",content}')
}

function looksLikeCodingRequest(content: string): boolean {
  return /(?:請|please|help).*(?:在|in)\s+[`"'./~\w-]+/i.test(content)
    || /(完成|建立|新增|實作|寫|build|implement|create|fix|code|develop).*(?:\.[/\\]|\/)/i.test(content)
}

function extractWorkspaceRoot(prompt: string, fallback: string): string {
  const quoted = prompt.match(/[`"'“”]((?:\.{0,2}\/|~\/|\/)[^`"'“”\s]+)[`"'“”]/)
  if (quoted) return quoted[1]
  const pathLike = prompt.match(/(?:^|\s)((?:\.{0,2}\/|~\/|\/)[^\s，。,.;:]+)/)
  return pathLike?.[1] ?? fallback
}

function resolveWorkspace(value: string): string {
  const base = process.cwd()
  const expanded = value.startsWith('~/') ? resolve(process.env.HOME ?? base, value.slice(2)) : value
  const absolute = isAbsolute(expanded) ? resolve(expanded) : resolve(base, expanded)
  // Coding tasks are intentionally constrained to cwd and its descendants.
  const rel = relative(base, absolute)
  if (rel === '..' || rel.startsWith('..' + '/') || isAbsolute(rel)) {
    throw new Error(`workspace must be inside the AI Hub process directory: ${value}`)
  }
  return absolute
}

function parseModelRef(ref: string): { provider: string; model: string } {
  const index = ref.indexOf(':')
  if (index <= 0 || index === ref.length - 1) throw new Error(`invalid modelRef "${ref}"`)
  return { provider: ref.slice(0, index), model: ref.slice(index + 1) }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function markActivitySucceeded(ctx: Context, id: string, startedMs: number) {
  ctx.storage.run('UPDATE activity_log SET status = ?, finished_at = ?, duration_ms = ? WHERE id = ?', [
    'succeeded', new Date().toISOString(), Date.now() - startedMs, id,
  ])
}

function markActivityFailed(ctx: Context, id: string, startedMs: number) {
  ctx.storage.run('UPDATE activity_log SET status = ?, finished_at = ?, duration_ms = ? WHERE id = ?', [
    'failed', new Date().toISOString(), Date.now() - startedMs, id,
  ])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max) + '\n...[truncated]'
}
