import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { AgentService } from './index.ts'
import { StorageService } from '../storage/index.ts'

before(() => {
  process.env.AI_HUB_DB_PATH = ':memory:'
})

/** Same bridging pattern used throughout this project since Phase 1. */
function withAgent(fn: (agent: AgentService) => void | Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctx = new Context()
    ctx.plugin(StorageService)
    ctx.plugin(AgentService)
    ctx.plugin({
      name: 'test-consumer',
      inject: ['agent', 'storage'],
      async apply(ctx: Context) {
        try {
          await fn(ctx.agent)
          resolve()
        } catch (err) {
          reject(err)
        }
      },
    })
  })
}

describe('AgentService.createAgent / getAgent', () => {
  test('should_persist_agent_when_created', async () => {
    await withAgent((agent) => {
      agent.createAgent('a1', 'Allen', 'anthropic:claude')
      const loaded = agent.getAgent('a1')
      assert.equal(loaded?.name, 'Allen')
      assert.equal(loaded?.modelRef, 'anthropic:claude')
      assert.equal(loaded?.canPeek, false)
    })
  })

  test('should_persist_explicit_canPeek_when_provided', async () => {
    await withAgent((agent) => {
      agent.createAgent('a1', 'Fallon', 'kimi:k2', true)
      assert.equal(agent.getAgent('a1')?.canPeek, true)
    })
  })

  test('should_throw_when_creating_agent_with_blank_name', async () => {
    await withAgent((agent) => {
      assert.throws(() => agent.createAgent('a1', '', 'ollama:llama3'))
    })
  })

  test('should_return_undefined_when_agent_not_found', async () => {
    await withAgent((agent) => {
      assert.equal(agent.getAgent('nonexistent'), undefined)
    })
  })

  test('should_throw_when_creating_agent_with_duplicate_id', async () => {
    await withAgent((agent) => {
      agent.createAgent('a1', 'Allen', 'anthropic:claude')
      assert.throws(() => agent.createAgent('a1', 'Someone Else', 'openai:gpt'))
    })
  })
})

describe('AgentService.listAgents', () => {
  test('should_list_all_created_agents', async () => {
    await withAgent((agent) => {
      agent.createAgent('a1', 'Allen', 'anthropic:claude')
      agent.createAgent('a2', 'Ben', 'openai:gpt')
      const names = agent.listAgents().map((a) => a.name).sort()
      assert.deepEqual(names, ['Allen', 'Ben'])
    })
  })

  test('should_return_empty_array_when_no_agents_exist', async () => {
    await withAgent((agent) => {
      assert.deepEqual(agent.listAgents(), [])
    })
  })
})
