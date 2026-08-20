/**
 * Pure domain logic for WorkflowDefinition — no I/O, no Cordis, no
 * persistence. See docs/adr/ADR-0005-orchestrator-and-workflow-architecture.md
 * and docs/adr/ADR-0007-orchestrator-implementation-and-dag-storage.md for
 * why this shape exists (Definition/Run split, JSON-serializable for a
 * future UI editor, no external graph library).
 */

export interface TaskNode {
  readonly id: string
  readonly agentId: string
  readonly task: string
}

export interface TaskEdge {
  /** Node id that must complete before `to` can start. */
  readonly from: string
  readonly to: string
}

export interface WorkflowDefinition {
  readonly id: string
  readonly name: string
  /** Which Room this workflow belongs to — see ADR-0005 for why (both the human-driven 範例1 and the manager-agent-driven 範例2 map onto "a workflow lives in a room"). */
  readonly roomId: string
  readonly nodes: readonly TaskNode[]
  readonly edges: readonly TaskEdge[]
  /** Name of a registered ctx.sandbox executor to run this workflow's actions through, or null for no isolation. See ADR-0006. */
  readonly sandboxExecutor: string | null
}

export type WorkflowRunStatus = 'succeeded' | 'failed'

export interface WorkflowRunResult {
  readonly runId: string
  readonly status: WorkflowRunStatus
}

function assertNonBlank(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must not be empty`)
  }
}

/**
 * Kahn's algorithm: repeatedly removes nodes with no remaining incoming
 * edges. If every node gets removed, the graph is acyclic. If any remain
 * stuck (all their prerequisites are each other), there's a cycle.
 * @throws if an edge references a node id not present in `nodes`, if node
 * ids are duplicated, or if the graph contains a cycle (including self-loops).
 */
export function validateAcyclic(nodes: readonly TaskNode[], edges: readonly TaskEdge[]): void {
  const nodeIds = new Set(nodes.map((n) => n.id))
  if (nodeIds.size !== nodes.length) {
    throw new Error('workflow contains duplicate node ids')
  }

  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()
  for (const id of nodeIds) {
    inDegree.set(id, 0)
    adjacency.set(id, [])
  }
  for (const e of edges) {
    if (!nodeIds.has(e.from)) throw new Error(`edge references unknown node "${e.from}"`)
    if (!nodeIds.has(e.to)) throw new Error(`edge references unknown node "${e.to}"`)
    adjacency.get(e.from)!.push(e.to)
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
  }

  const queue = [...nodeIds].filter((id) => inDegree.get(id) === 0)
  let visited = 0
  while (queue.length > 0) {
    const current = queue.shift()!
    visited++
    for (const next of adjacency.get(current) ?? []) {
      const remaining = (inDegree.get(next) ?? 0) - 1
      inDegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }

  if (visited !== nodeIds.size) {
    throw new Error('workflow graph contains a cycle')
  }
}

/**
 * @throws if `id`/`name`/`roomId` is blank, if any node's `id`/`agentId`/`task`
 * is blank, or if `nodes`+`edges` contain a cycle (see validateAcyclic).
 */
export function createWorkflowDefinition(params: {
  id: string
  name: string
  roomId: string
  nodes: TaskNode[]
  edges: TaskEdge[]
  sandboxExecutor?: string | null
}): WorkflowDefinition {
  assertNonBlank(params.id, 'WorkflowDefinition.id')
  assertNonBlank(params.name, 'WorkflowDefinition.name')
  assertNonBlank(params.roomId, 'WorkflowDefinition.roomId')
  for (const n of params.nodes) {
    assertNonBlank(n.id, 'TaskNode.id')
    assertNonBlank(n.agentId, 'TaskNode.agentId')
    assertNonBlank(n.task, 'TaskNode.task')
  }
  validateAcyclic(params.nodes, params.edges)

  return {
    id: params.id,
    name: params.name,
    roomId: params.roomId,
    nodes: params.nodes,
    edges: params.edges,
    sandboxExecutor: params.sandboxExecutor ?? null,
  }
}
