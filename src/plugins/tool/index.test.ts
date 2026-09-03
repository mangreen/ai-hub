import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { ToolService, type ToolDefinition } from './index.ts'

describe('ToolService', () => {
  function withToolService(fn: (ctx: Context) => void | Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const ctx = new Context()
      ctx.plugin(ToolService)
      ctx.plugin({
        name: 'consumer',
        inject: ['tool'],
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
  test('should_register_list_get_and_execute_tools', async () => {
    await withToolService(async (ctx) => {
      const tool: ToolDefinition = {
        name: 'echo',
        description: 'echo',
        inputSchema: { type: 'object' },
        async execute(args) {
          return { content: JSON.stringify(args) }
        },
      }
      ctx.tool.register(tool)

      assert.deepEqual(ctx.tool.list().map((item) => item.name), ['echo'])
      assert.equal(await ctx.tool.execute('echo', { value: 1 }, { workspaceRoot: process.cwd() }).then((r) => r.content), '{"value":1}')
    })
  })

  test('should_throw_for_unknown_tool', async () => {
    await withToolService(async (ctx) => {
      await assert.rejects(() => ctx.tool.execute('missing', {}, { workspaceRoot: process.cwd() }))
    })
  })
})
