import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    agent: AgentService
  }
  interface Events {
    // Not yet emitted by anything — reserved contract for Phase 5. Once
    // wired up: the manager-agent pattern (CLAUDE.md Phase 5, 範例2) runs on
    // this — one agent assigns work to another without either knowing the
    // other's implementation.
    'agent/task-assigned'(payload: { from: string; to: string; task: string }): void
  }
}

/**
 * Owns Agent definitions and task delegation. The pure domain rules
 * (Agent shape, assignTask validation) already exist in ./domain.ts and are
 * fully tested — this class is still an empty shell because nothing yet
 * calls them against real state. Phase 5's job is bigger than that: the
 * actual multi-agent loop/graph (manager pattern, task DAG) built ON TOP of
 * assignTask, not assignTask itself.
 */
export class AgentService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'agent')
  }

  // TODO(Phase 5): task DAG / manager loop, using createAgent/assignTask
  // from ./domain.ts as the primitive it's built from.
}
