import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { ChatService } from '../../chat/index.ts'
import { AgentService } from '../../agent/index.ts'
import { ModelService, type ModelProvider } from '../../model/index.ts'
import { StorageService } from '../../storage/index.ts'
import { OrchestratorService } from '../index.ts'
import * as taskGraphStrategy from './index.ts'

before(() => {
  process.env.AI_HUB_DB_PATH = ':memory:'
})

/**
 * Records call order and echoes the task back — lets tests assert on
 * dependency-respecting execution order without relying on wall-clock
 * timestamps, and never makes a real network call.
 */
function fakeProvider(callOrder: string[]): ModelProvider {
  return {
    name: 'fake',
    async complete(messages) {
      const task = messages[0].content
      callOrder.push(task)
      return { content: `done: ${task}`, model: 'fake-model' }
    },
  }
}

/** Failing provider — always throws, to test the failure path. */
function failingProvider(): ModelProvider {
  return {
    name: 'fake-failing',
    async complete() {
      throw new Error('simulated model failure')
    },
  }
}

function buildKernel() {
  const ctx = new Context()
  ctx.plugin(StorageService)
  ctx.plugin(ChatService)
  ctx.plugin(AgentService)
  ctx.plugin(ModelService)
  ctx.plugin(OrchestratorService)
  ctx.plugin(taskGraphStrategy)
  return ctx
}

function withKernel(fn: (ctx: Context) => void | Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctx = buildKernel()
    ctx.plugin({
      name: 'test-consumer',
      inject: ['chat', 'agent', 'model', 'storage', 'orchestrator'],
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

describe('task-graph strategy — success path', () => {
  test('should_register_itself_as_task-graph', async () => {
    await withKernel((ctx) => {
      assert.ok(ctx.orchestrator.list().includes('task-graph'))
    })
  })

  test('should_run_nodes_in_dependency_order_and_record_everything', async () => {
    await withKernel(async (ctx) => {
      const callOrder: string[] = []
      ctx.model.register(fakeProvider(callOrder))

      const taskAssignedEvents: unknown[] = []
      const chatMessageEvents: unknown[] = []
      ctx.on('agent/task-assigned', (p) => taskAssignedEvents.push(p))
      ctx.on('chat/message', (p) => chatMessageEvents.push(p))

      ctx.chat.createRoom('r1', 'Build the app')
      ctx.agent.createAgent('allen', 'Allen', 'fake:test-model')
      ctx.agent.createAgent('ben', 'Ben', 'fake:test-model')

      const wf = ctx.orchestrator.createWorkflow({
        id: 'wf1',
        name: 'Build it',
        roomId: 'r1',
        nodes: [
          { id: 'n1', agentId: 'allen', task: 'write frontend contract' },
          { id: 'n2', agentId: 'ben', task: 'write backend using contract' },
        ],
        edges: [{ from: 'n1', to: 'n2' }],
      })

      const result = await ctx.orchestrator.run(wf.id, 'task-graph')

      assert.equal(result.status, 'succeeded')
      // dependency order respected: n1's task called before n2's
      assert.deepEqual(callOrder, ['write frontend contract', 'write backend using contract'])

      const run = ctx.storage.get<{ status: string }>('SELECT status FROM workflow_runs WHERE id = ?', [result.runId])
      assert.equal(run?.status, 'succeeded')

      const nodeRuns = ctx.storage.all<{ node_id: string; status: string }>(
        'SELECT node_id, status FROM task_node_runs WHERE run_id = ? ORDER BY node_id',
        [result.runId],
      )
      // node:sqlite returns null-prototype row objects — spread to plain
      // objects before strict deepEqual, or it fails on prototype mismatch
      // alone even when every property matches.
      assert.deepEqual(nodeRuns.map((r) => ({ ...r })), [
        { node_id: 'n1', status: 'succeeded' },
        { node_id: 'n2', status: 'succeeded' },
      ])

      const activity = ctx.storage.all<{ kind: string; target: string; status: string }>(
        'SELECT kind, target, status FROM activity_log WHERE workflow_run_id = ?',
        [result.runId],
      )
      assert.equal(activity.length, 2)
      assert.ok(activity.every((a) => a.kind === 'model_call' && a.status === 'succeeded' && a.target === 'fake:test-model'))

      const messages = ctx.chat.listMessages('r1')
      assert.equal(messages.length, 2)
      assert.equal(messages[0].content, 'done: write frontend contract')
      assert.equal(messages[1].content, 'done: write backend using contract')

      assert.equal(taskAssignedEvents.length, 2)
      assert.equal(chatMessageEvents.length, 2)
    })
  })

  test('should_run_independent_nodes_when_there_are_no_edges', async () => {
    await withKernel(async (ctx) => {
      const callOrder: string[] = []
      ctx.model.register(fakeProvider(callOrder))
      ctx.chat.createRoom('r1', 'Team')
      ctx.agent.createAgent('allen', 'Allen', 'fake:m')
      ctx.agent.createAgent('ben', 'Ben', 'fake:m')

      const wf = ctx.orchestrator.createWorkflow({
        id: 'wf1', name: 'Parallel work', roomId: 'r1',
        nodes: [
          { id: 'n1', agentId: 'allen', task: 'task A' },
          { id: 'n2', agentId: 'ben', task: 'task B' },
        ],
        edges: [],
      })

      const result = await ctx.orchestrator.run(wf.id, 'task-graph')
      assert.equal(result.status, 'succeeded')
      assert.deepEqual([...callOrder].sort(), ['task A', 'task B'])
    })
  })
})

describe('task-graph strategy — failure path', () => {
  test('should_mark_workflow_and_node_as_failed_when_model_call_throws', async () => {
    await withKernel(async (ctx) => {
      ctx.model.register(failingProvider())
      ctx.chat.createRoom('r1', 'Team')
      ctx.agent.createAgent('allen', 'Allen', 'fake-failing:m')

      const wf = ctx.orchestrator.createWorkflow({
        id: 'wf1', name: 'Will fail', roomId: 'r1',
        nodes: [{ id: 'n1', agentId: 'allen', task: 'do something' }],
        edges: [],
      })

      const result = await ctx.orchestrator.run(wf.id, 'task-graph')
      assert.equal(result.status, 'failed')

      const run = ctx.storage.get<{ status: string }>('SELECT status FROM workflow_runs WHERE id = ?', [result.runId])
      assert.equal(run?.status, 'failed')

      const nodeRun = ctx.storage.get<{ status: string }>('SELECT status FROM task_node_runs WHERE run_id = ?', [result.runId])
      assert.equal(nodeRun?.status, 'failed')

      const activity = ctx.storage.get<{ status: string }>('SELECT status FROM activity_log WHERE workflow_run_id = ?', [result.runId])
      assert.equal(activity?.status, 'failed')
    })
  })

  test('should_throw_when_a_node_references_a_nonexistent_agent', async () => {
    await withKernel(async (ctx) => {
      ctx.chat.createRoom('r1', 'Team')
      const wf = ctx.orchestrator.createWorkflow({
        id: 'wf1', name: 'Bad', roomId: 'r1',
        nodes: [{ id: 'n1', agentId: 'ghost', task: 'x' }],
        edges: [],
      })
      const result = await ctx.orchestrator.run(wf.id, 'task-graph')
      assert.equal(result.status, 'failed')
    })
  })
})
