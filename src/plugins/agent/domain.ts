/**
 * Pure domain logic for Agent/task-assignment — no I/O, no Cordis.
 * The full multi-agent loop/graph (manager pattern, task DAG) is Phase 5's
 * job; this is just the smallest correct building block it'll be built on.
 */

export interface Agent {
  readonly id: string
  readonly name: string
  /** Which model provider backs this agent, e.g. 'ollama:llama3' or 'anthropic:claude'. */
  readonly modelRef: string
  /**
   * Whether this agent can view rooms it isn't a member of. Secure by
   * default (false) — matches chat/domain.ts's AgentVisibility.canPeek.
   * Deliberately NOT the same field name as Room.id ("agentId" there vs
   * "id" here) — chat/domain.ts intentionally only depends on a minimal
   * structural shape, not on this Agent type directly, to keep the chat
   * and agent domains decoupled. Phase 5 maps between them explicitly.
   */
  readonly canPeek: boolean
}

export interface TaskAssignment {
  readonly fromAgentId: string
  readonly toAgentId: string
  readonly task: string
}

function assertNonBlank(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must not be empty`)
  }
}

/** @throws if `id`, `name`, or `modelRef` is empty/whitespace-only. */
export function createAgent(params: {
  id: string
  name: string
  modelRef: string
  canPeek?: boolean
}): Agent {
  assertNonBlank(params.id, 'Agent.id')
  assertNonBlank(params.name, 'Agent.name')
  assertNonBlank(params.modelRef, 'Agent.modelRef')
  return {
    id: params.id,
    name: params.name,
    modelRef: params.modelRef,
    canPeek: params.canPeek ?? false,
  }
}

/** @throws if `fromAgentId === toAgentId`, or if `task` is empty/whitespace-only. */
export function assignTask(fromAgentId: string, toAgentId: string, task: string): TaskAssignment {
  if (fromAgentId === toAgentId) {
    throw new Error('an agent cannot assign a task to itself')
  }
  assertNonBlank(task, 'task')
  return { fromAgentId, toAgentId, task }
}
