import { Context } from 'cordis'
import { randomUUID } from 'node:crypto'
import { topologicalOrder, type WorkflowDefinition, type WorkflowRunResult, type TaskNode } from '../domain.ts'
import { parseModelRef } from '../../agent/domain.ts'

export const name = 'task-graph-strategy'
export const inject = ['orchestrator', 'agent', 'model', 'chat', 'storage']

/**
 * The default (and, as of Phase 5, only) OrchestrationStrategy — see
 * docs/adr/ADR-0005-orchestrator-and-workflow-architecture.md and
 * docs/adr/ADR-0007-orchestrator-implementation-and-dag-storage.md for why
 * this is hand-written rather than LangGraph.js/openai-agents-js. Executes a
 * WorkflowDefinition's nodes in topological order (sequentially — even
 * independent branches aren't parallelized yet, see runTaskGraph's doc
 * comment for why that's a deliberate simplification, not an oversight).
 */
export function apply(ctx: Context) {
  ctx.orchestrator.register({
    name: 'task-graph',
    runWorkflow: (definition) => runTaskGraph(ctx, definition),
  })
}

/**
 * Sequential, fail-fast execution: nodes run one at a time in topological
 * order; the first node to throw stops the whole run. Independent branches
 * (no edge between them) could in principle run in parallel via
 * Promise.all — deliberately not done yet (YAGNI): it would complicate
 * activity_log/task_node_runs bookkeeping and error-aggregation for no
 * benefit the current example ("Allen writes frontend / Ben writes
 * backend") actually needs. Revisit if a real workflow's wall-clock time
 * becomes a problem.
 */
async function runTaskGraph(ctx: Context, definition: WorkflowDefinition): Promise<WorkflowRunResult> {
  const order = topologicalOrder(definition.nodes, definition.edges)
  const nodesById = new Map(definition.nodes.map((n) => [n.id, n]))

  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  ctx.storage.run(
    'INSERT INTO workflow_runs (id, workflow_id, status, started_at, finished_at) VALUES (?, ?, ?, ?, ?)',
    [runId, definition.id, 'running', startedAt, null],
  )

  try {
    for (const nodeId of order) {
      const node = nodesById.get(nodeId)!
      await runNode(ctx, definition, runId, node)
    }
    ctx.storage.run('UPDATE workflow_runs SET status = ?, finished_at = ? WHERE id = ?', [
      'succeeded',
      new Date().toISOString(),
      runId,
    ])
    return { runId, status: 'succeeded' }
  } catch {
    ctx.storage.run('UPDATE workflow_runs SET status = ?, finished_at = ? WHERE id = ?', [
      'failed',
      new Date().toISOString(),
      runId,
    ])
    return { runId, status: 'failed' }
  }
}

/**
 * @throws if `node.agentId` doesn't reference an existing Agent, if
 * `agent.modelRef` isn't in "provider:model" format, if the provider isn't
 * registered in ctx.model, or if the model call itself fails — all of which
 * propagate up to fail the whole workflow run (see runTaskGraph's fail-fast
 * doc comment).
 */
async function runNode(ctx: Context, definition: WorkflowDefinition, runId: string, node: TaskNode): Promise<void> {
  const agent = ctx.agent.getAgent(node.agentId)
  if (!agent) throw new Error(`agent "${node.agentId}" does not exist`)

  const nodeRunId = randomUUID()
  const nodeStartedAt = new Date().toISOString()
  ctx.storage.run(
    'INSERT INTO task_node_runs (id, run_id, node_id, agent_id, status, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [nodeRunId, runId, node.id, node.agentId, 'running', nodeStartedAt, null],
  )

  ctx.emit('agent/task-assigned', { from: 'orchestrator', to: node.agentId, task: node.task })

  const { provider: providerName, model } = parseModelRef(agent.modelRef)
  const provider = ctx.model.get(providerName)
  if (!provider) throw new Error(`model provider "${providerName}" is not registered`)

  const activityId = randomUUID()
  const activityStartedAtMs = Date.now()
  // metadata is intentionally omitted here — see ADR-0005/0006: activity_log
  // must never capture raw API keys or full request/response payloads, and
  // kind+target already say what was called without needing more detail.
  ctx.storage.run(
    'INSERT INTO activity_log (id, workflow_run_id, task_node_run_id, agent_id, kind, target, started_at, finished_at, duration_ms, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [activityId, runId, nodeRunId, node.agentId, 'model_call', `${providerName}:${model}`, new Date(activityStartedAtMs).toISOString(), null, null, 'running', null],
  )

  try {
    const result = await provider.complete([{ role: 'user', content: node.task }], model)
    const finishedAt = new Date().toISOString()
    const durationMs = Date.now() - activityStartedAtMs

    ctx.storage.run('UPDATE activity_log SET status = ?, finished_at = ?, duration_ms = ? WHERE id = ?', [
      'succeeded',
      finishedAt,
      durationMs,
      activityId,
    ])
    ctx.storage.run('UPDATE task_node_runs SET status = ?, finished_at = ? WHERE id = ?', ['succeeded', finishedAt, nodeRunId])
    ctx.chat.postMessage(randomUUID(), definition.roomId, node.agentId, result.content)
  } catch (err) {
    const finishedAt = new Date().toISOString()
    const durationMs = Date.now() - activityStartedAtMs
    ctx.storage.run('UPDATE activity_log SET status = ?, finished_at = ?, duration_ms = ? WHERE id = ?', [
      'failed',
      finishedAt,
      durationMs,
      activityId,
    ])
    ctx.storage.run('UPDATE task_node_runs SET status = ?, finished_at = ? WHERE id = ?', ['failed', finishedAt, nodeRunId])
    throw err
  }
}
