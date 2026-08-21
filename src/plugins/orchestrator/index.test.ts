import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { OrchestratorService, type OrchestrationStrategy } from './index.ts'
import { ChatService } from '../chat/index.ts'
import { StorageService } from '../storage/index.ts'

before(() => {
  process.env.AI_HUB_DB_PATH = ':memory:'
})

/** Minimal OrchestrationStrategy fixture — most tests only exercise the registry, never runWorkflow(). */
function fixture(name: string, result: { runId: string; status: 'succeeded' | 'failed' } = { runId: 'run-x', status: 'succeeded' }): OrchestrationStrategy {
  return { name, runWorkflow: async () => result }
}

/**
 * Same bridging pattern used throughout this project since Phase 1. Also
 * mounts ChatService/StorageService — OrchestratorService needs storage for
 * workflow persistence, and a real Room is needed to satisfy
 * workflow_definitions' FK to rooms.
 */
function withOrchestratorService(fn: (ctx: Context) => void | Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctx = new Context()
    ctx.plugin(StorageService)
    ctx.plugin(ChatService)
    ctx.plugin(OrchestratorService)
    ctx.plugin({
      name: 'test-consumer',
      inject: ['orchestrator', 'chat', 'storage'],
      async apply(ctx: Context) {
        try {
          await fn(ctx)
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
    await withOrchestratorService((ctx) => {
      ctx.orchestrator.register(fixture('task-graph'))
      assert.deepEqual(ctx.orchestrator.list(), ['task-graph'])
    })
  })

  test('should_throw_when_registering_duplicate_name', async () => {
    await withOrchestratorService((ctx) => {
      ctx.orchestrator.register(fixture('task-graph'))
      assert.throws(() => ctx.orchestrator.register(fixture('task-graph')))
    })
  })

  test('should_get_strategy_by_name_when_registered', async () => {
    await withOrchestratorService((ctx) => {
      const strategy = fixture('task-graph')
      ctx.orchestrator.register(strategy)
      assert.equal(ctx.orchestrator.get('task-graph'), strategy)
    })
  })

  test('should_return_undefined_when_strategy_not_registered', async () => {
    await withOrchestratorService((ctx) => {
      assert.equal(ctx.orchestrator.get('nonexistent'), undefined)
    })
  })

  test('should_remove_strategy_when_returned_disposer_is_called', async () => {
    await withOrchestratorService(async (ctx) => {
      const dispose = ctx.orchestrator.register(fixture('task-graph'))
      assert.deepEqual(ctx.orchestrator.list(), ['task-graph'])
      await dispose()
      assert.deepEqual(ctx.orchestrator.list(), [])
    })
  })
})

describe('OrchestratorService.createWorkflow / getWorkflow', () => {
  test('should_persist_workflow_when_created', async () => {
    await withOrchestratorService((ctx) => {
      ctx.chat.createRoom('r1', 'Team')
      const wf = ctx.orchestrator.createWorkflow({
        id: 'wf1',
        name: 'Build it',
        roomId: 'r1',
        nodes: [{ id: 'n1', agentId: 'a1', task: 'do x' }],
        edges: [],
      })
      assert.equal(wf.id, 'wf1')
      assert.equal(wf.nodes.length, 1)
    })
  })

  test('should_load_back_an_equivalent_workflow', async () => {
    await withOrchestratorService((ctx) => {
      ctx.chat.createRoom('r1', 'Team')
      const created = ctx.orchestrator.createWorkflow({
        id: 'wf1',
        name: 'Build it',
        roomId: 'r1',
        nodes: [{ id: 'n1', agentId: 'a1', task: 'do x' }],
        edges: [],
        sandboxExecutor: 'seatbelt',
      })
      const loaded = ctx.orchestrator.getWorkflow('wf1')
      assert.deepEqual(loaded, created)
    })
  })

  test('should_throw_when_workflow_definition_is_invalid', async () => {
    await withOrchestratorService((ctx) => {
      ctx.chat.createRoom('r1', 'Team')
      assert.throws(() =>
        ctx.orchestrator.createWorkflow({ id: 'wf1', name: '', roomId: 'r1', nodes: [], edges: [] }),
      )
    })
  })

  test('should_return_undefined_when_workflow_not_found', async () => {
    await withOrchestratorService((ctx) => {
      assert.equal(ctx.orchestrator.getWorkflow('nonexistent'), undefined)
    })
  })
})

describe('OrchestratorService.run', () => {
  test('should_call_matching_strategy_with_the_loaded_definition', async () => {
    await withOrchestratorService(async (ctx) => {
      ctx.chat.createRoom('r1', 'Team')
      const wf = ctx.orchestrator.createWorkflow({
        id: 'wf1', name: 'Build it', roomId: 'r1',
        nodes: [{ id: 'n1', agentId: 'a1', task: 'do x' }], edges: [],
      })
      let received: unknown
      ctx.orchestrator.register({
        name: 'task-graph',
        async runWorkflow(definition) {
          received = definition
          return { runId: 'run-1', status: 'succeeded' }
        },
      })
      const result = await ctx.orchestrator.run('wf1', 'task-graph')
      assert.equal(result.status, 'succeeded')
      assert.deepEqual(received, wf)
    })
  })

  test('should_throw_when_workflow_not_found', async () => {
    await withOrchestratorService(async (ctx) => {
      ctx.orchestrator.register(fixture('task-graph'))
      await assert.rejects(() => ctx.orchestrator.run('nonexistent', 'task-graph'))
    })
  })

  test('should_throw_when_strategy_not_registered', async () => {
    await withOrchestratorService(async (ctx) => {
      ctx.chat.createRoom('r1', 'Team')
      ctx.orchestrator.createWorkflow({
        id: 'wf1', name: 'Build it', roomId: 'r1', nodes: [], edges: [],
      })
      await assert.rejects(() => ctx.orchestrator.run('wf1', 'nonexistent-strategy'))
    })
  })
})
