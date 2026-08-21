import { Context, Service } from 'cordis'
import { createWorkflowDefinition, type WorkflowDefinition, type WorkflowRunResult } from './domain.ts'

export interface OrchestrationStrategy {
  name: string
  /** @throws if the workflow can't be executed by this strategy. */
  runWorkflow(definition: WorkflowDefinition): Promise<WorkflowRunResult>
}

declare module 'cordis' {
  interface Context {
    orchestrator: OrchestratorService
  }
}

interface WorkflowDefinitionRow {
  id: string
  name: string
  room_id: string
  definition_json: string
  sandbox_executor: string | null
}

function fromRow(row: WorkflowDefinitionRow): WorkflowDefinition {
  const { nodes, edges } = JSON.parse(row.definition_json)
  return {
    id: row.id,
    name: row.name,
    roomId: row.room_id,
    nodes,
    edges,
    sandboxExecutor: row.sandbox_executor,
  }
}

/**
 * Registry for pluggable Agent Loop/Graph/Harness strategies, AND
 * persistence for WorkflowDefinition — see
 * docs/adr/ADR-0005-orchestrator-and-workflow-architecture.md for why this
 * is its own service rather than logic baked into AgentService, and
 * docs/adr/ADR-0007-orchestrator-implementation-and-dag-storage.md for why
 * the default strategy is hand-written rather than LangGraph.js or
 * openai-agents-js, and why `nodes`/`edges` are stored as one JSON blob
 * rather than normalized tables. Same registry pattern as
 * ModelService/ChannelService — see MEM-20260816-registrations-as-effects.md
 * for why register() doesn't need its disposer manually tracked (only
 * relevant if you want to unregister without unmounting the whole plugin).
 *
 * Workflow persistence and strategy registration are combined in this one
 * service rather than split into two — there wasn't a natural third service
 * to own WorkflowDefinition CRUD, and it's small enough not to warrant
 * fragmenting further (see MEM-20260819-phase5-orchestrator-sandbox-schema.md).
 */
export class OrchestratorService extends Service {
  static inject = ['storage']

  private strategies = new Map<string, OrchestrationStrategy>()

  constructor(ctx: Context) {
    super(ctx, 'orchestrator')
  }

  register(strategy: OrchestrationStrategy) {
    return this.ctx.effect(() => {
      if (this.strategies.has(strategy.name)) {
        throw new Error(`orchestration strategy "${strategy.name}" already registered`)
      }
      this.strategies.set(strategy.name, strategy)
      return () => {
        this.strategies.delete(strategy.name)
      }
    })
  }

  /** Returns the registered strategy, or `undefined` if no strategy with this name is registered. */
  get(name: string): OrchestrationStrategy | undefined {
    return this.strategies.get(name)
  }

  /** Names of all currently registered strategies, in registration order. */
  list(): string[] {
    return [...this.strategies.keys()]
  }

  /** @throws see domain.ts's createWorkflowDefinition (blank fields, cycles), or on duplicate id / unknown roomId (FK). */
  createWorkflow(params: {
    id: string
    name: string
    roomId: string
    nodes: WorkflowDefinition['nodes']
    edges: WorkflowDefinition['edges']
    sandboxExecutor?: string | null
  }): WorkflowDefinition {
    const wf = createWorkflowDefinition(params)
    const now = new Date().toISOString()
    this.ctx.storage.run(
      'INSERT INTO workflow_definitions (id, name, room_id, definition_json, sandbox_executor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [wf.id, wf.name, wf.roomId, JSON.stringify({ nodes: wf.nodes, edges: wf.edges }), wf.sandboxExecutor, now, now],
    )
    return wf
  }

  getWorkflow(id: string): WorkflowDefinition | undefined {
    const row = this.ctx.storage.get<WorkflowDefinitionRow>('SELECT * FROM workflow_definitions WHERE id = ?', [id])
    return row ? fromRow(row) : undefined
  }

  /**
   * Loads the workflow, looks up the strategy, and delegates execution to it
   * — the one place these two registries meet.
   * @throws if `workflowId` doesn't reference an existing workflow, or if
   * `strategyName` isn't a registered strategy.
   */
  async run(workflowId: string, strategyName: string): Promise<WorkflowRunResult> {
    const definition = this.getWorkflow(workflowId)
    if (!definition) throw new Error(`workflow "${workflowId}" does not exist`)
    const strategy = this.get(strategyName)
    if (!strategy) throw new Error(`orchestration strategy "${strategyName}" is not registered`)
    return strategy.runWorkflow(definition)
  }
}
