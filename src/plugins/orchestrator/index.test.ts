import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { OrchestratorService, type OrchestrationStrategy } from './index.ts'

/** Minimal OrchestrationStrategy fixture — these tests only exercise the registry, never runWorkflow(). */
function fixture(name: string): OrchestrationStrategy {
  return { name, runWorkflow: async () => ({ runId: '', status: 'succeeded' }) }
}

/** Same bridging pattern used throughout this project since Phase 1. */
function withOrchestratorService(fn: (orchestrator: OrchestratorService) => void | Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctx = new Context()
    ctx.plugin(OrchestratorService)
    ctx.plugin({
      name: 'test-consumer',
      inject: ['orchestrator'],
      async apply(ctx: Context) {
        try {
          await fn(ctx.orchestrator)
          resolve()
        } catch (err) {
          reject(err)
        }
      },
    })
  })
}

describe('OrchestratorService.register', () => {
  test('should_list_registered_strategy_when_registered', async () => {
    await withOrchestratorService((orchestrator) => {
      orchestrator.register(fixture('task-graph'))
      assert.deepEqual(orchestrator.list(), ['task-graph'])
    })
  })

  test('should_throw_when_registering_duplicate_name', async () => {
    await withOrchestratorService((orchestrator) => {
      orchestrator.register(fixture('task-graph'))
      assert.throws(() => orchestrator.register(fixture('task-graph')))
    })
  })

  test('should_get_strategy_by_name_when_registered', async () => {
    await withOrchestratorService((orchestrator) => {
      const strategy = fixture('task-graph')
      orchestrator.register(strategy)
      assert.equal(orchestrator.get('task-graph'), strategy)
    })
  })

  test('should_return_undefined_when_strategy_not_registered', async () => {
    await withOrchestratorService((orchestrator) => {
      assert.equal(orchestrator.get('nonexistent'), undefined)
    })
  })

  test('should_remove_strategy_when_returned_disposer_is_called', async () => {
    await withOrchestratorService(async (orchestrator) => {
      const dispose = orchestrator.register(fixture('task-graph'))
      assert.deepEqual(orchestrator.list(), ['task-graph'])
      await dispose()
      assert.deepEqual(orchestrator.list(), [])
    })
  })
})
