import { Context, Service } from 'cordis'
import type { WorkflowDefinition, WorkflowRunResult } from './domain.ts'

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

/**
 * Registry for pluggable Agent Loop/Graph/Harness strategies — see
 * docs/adr/ADR-0005-orchestrator-and-workflow-architecture.md for why this
 * is its own service rather than logic baked into AgentService, and
 * docs/adr/ADR-0007-orchestrator-implementation-and-dag-storage.md for why
 * the default strategy is hand-written rather than LangGraph.js or
 * openai-agents-js. Same registry pattern as ModelService/ChannelService —
 * see MEM-20260816-registrations-as-effects.md for why register() doesn't
 * need its disposer manually tracked (only relevant if you want to
 * unregister without unmounting the whole plugin).
 */
export class OrchestratorService extends Service {
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
}
