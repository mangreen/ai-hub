import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ChatService } from '../../chat/index.ts'
import { AgentService } from '../../agent/index.ts'
import { ModelService, type ModelProvider } from '../../model/index.ts'
import { StorageService } from '../../storage/index.ts'
import { OrchestratorService } from '../index.ts'
import { ToolService, type ToolDefinition } from '../../tool/index.ts'
import * as codingAgent from './index.ts'

before(() => {
  process.env.AI_HUB_DB_PATH = ':memory:'
})

function buildKernel() {
  const ctx = new Context()
  ctx.plugin(StorageService)
  ctx.plugin(ChatService)
  ctx.plugin(AgentService)
  ctx.plugin(ModelService)
  ctx.plugin(OrchestratorService)
  ctx.plugin(ToolService)
  ctx.plugin(codingAgent)
  return ctx
}

function withKernel(fn: (ctx: Context) => void | Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctx = buildKernel()
    ctx.plugin({
      name: 'test-consumer',
      inject: ['storage', 'chat', 'agent', 'model', 'orchestrator', 'tool'],
      async apply(ctx: Context) {
        try {
          await fn(ctx)
          resolve()
        } catch (error) {
          reject(error)
        }
      },
    })
  })
}

function sequenceProvider(): ModelProvider {
  let call = 0
  return {
    name: 'fake-coding',
    async complete() {
      call++
      if (call === 1) {
        return {
          model: 'fake',
          content: JSON.stringify({
            action: 'tool',
            tool: 'write_marker',
            arguments: { path: 'result.txt', content: 'implemented\n' },
          }),
        }
      }
      if (call === 2) {
        return {
          model: 'fake',
          content: JSON.stringify({
            action: 'tool',
            tool: 'run_command',
            arguments: { command: 'pnpm', args: ['test'] },
          }),
        }
      }
      return {
        model: 'fake',
        content: JSON.stringify({
          action: 'final',
          content: 'Implemented the project and verified it.',
        }),
      }
    },
  }
}

describe('coding-agent strategy', () => {
  const roots: string[] = []

  after(async () => {
    for (const root of roots) await fs.rm(root, { recursive: true, force: true })
  })

  test('should_register_coding-agent_strategy', async () => {
    await withKernel((ctx) => {
      assert.ok(ctx.orchestrator.list().includes('coding-agent'))
    })
  })

  test('should_execute_tool_loop_and_leave_changes_in_workspace', async () => {
    await withKernel(async (ctx) => {
      ctx.chat.createRoom('r1', 'coding')
      ctx.model.register(sequenceProvider())
      ctx.agent.createAgent('test-coding', 'Test Coding Agent', 'fake-coding:fake')

      const workspace = join(process.cwd(), '.tmp', `coding-agent-test-${Date.now()}`)
      roots.push(workspace)

      const tool: ToolDefinition = {
        name: 'write_marker',
        description: 'Write a test marker into the current workspace.',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' }, content: { type: 'string' } },
          required: ['path', 'content'],
        },
        async execute(args, context) {
          const object = args as { path: string; content: string }
          const path = join(context.workspaceRoot, object.path)
          await fs.mkdir(join(path, '..'), { recursive: true })
          await fs.writeFile(path, object.content, 'utf8')
          return { content: `wrote ${object.path}` }
        },
      }
      ctx.tool.register(tool)
      ctx.tool.register({
        name: 'run_command',
        description: 'fake successful verification command',
        inputSchema: { type: 'object' },
        async execute() {
          await fs.writeFile(join(workspace, 'verified.txt'), 'tests passed\n', 'utf8')
          return { content: 'exit_code: 0\nstdout: 160 tests passed' }
        },
      })

      const result = await ctx.orchestrator.runTask('coding-agent', {
        roomId: 'r1',
        prompt: '請在 ./workspace/ 完成一個小專案',
        agentId: 'test-coding',
        workspaceRoot: workspace,
        maxSteps: 5,
      })

      assert.equal(result.status, 'succeeded')
      assert.equal((await fs.readFile(join(workspace, 'result.txt'), 'utf8')), 'implemented\n')
      assert.equal((await fs.readFile(join(workspace, 'verified.txt'), 'utf8')), 'tests passed\n')

      const activities = ctx.storage.all<{ kind: string; status: string }>(
        'SELECT kind, status FROM activity_log WHERE workflow_run_id = ? ORDER BY started_at',
        [result.runId],
      )
      assert.equal(activities.filter((item) => item.kind === 'model_call').length, 3)
      assert.equal(activities.filter((item) => item.kind === 'tool_call').length, 2)
      assert.ok(activities.every((item) => item.status === 'succeeded'))

      const messages = ctx.chat.listMessages('r1')
      assert.equal(messages.at(-1)?.content, 'Implemented the project and verified it.')
    })
  })
})
