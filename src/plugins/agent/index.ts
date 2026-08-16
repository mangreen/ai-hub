import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    agent: AgentService
  }
  interface Events {
    // The manager-agent pattern (README 範例2) runs on this: one agent assigns
    // work to another without either knowing the other's implementation.
    'agent/task-assigned'(payload: { from: string; to: string; task: string }): void
  }
}

/**
 * Owns Agent definitions (name, backing model, role) and task delegation.
 * Empty shell for Phase 1 — the actual multi-agent loop/graph (manager
 * pattern, task DAG) is Phase 5's job.
 */
export class AgentService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'agent')
  }

  // TODO(Phase 5): createAgent(name, modelRef), assignTask, task DAG / manager loop
}
