import { Context, Service } from 'cordis'
import { createAgent, type Agent } from './domain.ts'

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

interface AgentRow {
  id: string
  name: string
  model_ref: string
  can_peek: number
}

function fromRow(row: AgentRow): Agent {
  return { id: row.id, name: row.name, modelRef: row.model_ref, canPeek: !!row.can_peek }
}

/**
 * Owns Agent persistence. Validation (blank name/modelRef) lives in
 * ./domain.ts's createAgent — this class only translates between that and
 * ctx.storage's `agents` table. Task delegation is NOT here: assignTask is
 * a pure function with no state of its own, and the actual multi-agent
 * loop/graph (manager pattern, task DAG) that will call it is Phase 5's job.
 */
export class AgentService extends Service {
  static inject = ['storage']

  constructor(ctx: Context) {
    super(ctx, 'agent')
  }

  /** @throws if `name` or `modelRef` is blank, or if `id` is already taken. */
  createAgent(id: string, name: string, modelRef: string, canPeek = false): Agent {
    const agent = createAgent({ id, name, modelRef, canPeek })
    this.ctx.storage.run('INSERT INTO agents (id, name, model_ref, can_peek) VALUES (?, ?, ?, ?)', [
      agent.id,
      agent.name,
      agent.modelRef,
      agent.canPeek ? 1 : 0,
    ])
    return agent
  }

  getAgent(id: string): Agent | undefined {
    const row = this.ctx.storage.get<AgentRow>('SELECT * FROM agents WHERE id = ?', [id])
    return row ? fromRow(row) : undefined
  }

  listAgents(): Agent[] {
    return this.ctx.storage.all<AgentRow>('SELECT * FROM agents').map(fromRow)
  }

  // TODO(Phase 5): task DAG / manager loop, using assignTask from ./domain.ts
  // as the primitive it's built from.
}
