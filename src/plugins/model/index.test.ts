import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { ModelService, type ModelProvider } from './index.ts'

/** Minimal ModelProvider fixture — these tests only exercise the registry, never .complete(). */
function fixture(name: string): ModelProvider {
  return { name, complete: async () => ({ content: '', model: '' }) }
}

/**
 * Bridges Cordis's async plugin mounting into a single awaitable assertion
 * block. `fn` runs once `ctx.model` is guaranteed ready (via `inject`), same
 * ordering guarantee the real provider plugins in Phase 3 will rely on.
 */
function withModelService(fn: (model: ModelService) => void | Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctx = new Context()
    ctx.plugin(ModelService)
    ctx.plugin({
      name: 'test-consumer',
      inject: ['model'],
      async apply(ctx: Context) {
        try {
          await fn(ctx.model)
          resolve()
        } catch (err) {
          reject(err)
        }
      },
    })
  })
}

describe('ModelService.register', () => {
  test('should_list_registered_provider_when_registered', async () => {
    await withModelService((model) => {
      model.register(fixture('ollama'))
      assert.deepEqual(model.list(), ['ollama'])
    })
  })

  test('should_throw_when_registering_duplicate_name', async () => {
    await withModelService((model) => {
      model.register(fixture('ollama'))
      assert.throws(() => model.register(fixture('ollama')))
    })
  })

  test('should_get_provider_by_name_when_registered', async () => {
    await withModelService((model) => {
      const provider = fixture('ollama')
      model.register(provider)
      assert.equal(model.get('ollama'), provider)
    })
  })

  test('should_return_undefined_when_provider_not_registered', async () => {
    await withModelService((model) => {
      assert.equal(model.get('nonexistent'), undefined)
    })
  })

  test('should_remove_provider_when_returned_disposer_is_called', async () => {
    await withModelService(async (model) => {
      const dispose = model.register(fixture('ollama'))
      assert.deepEqual(model.list(), ['ollama'])
      await dispose()
      assert.deepEqual(model.list(), [])
    })
  })

  test('should_allow_reregistering_same_name_after_dispose', async () => {
    await withModelService(async (model) => {
      const dispose = model.register(fixture('ollama'))
      await dispose()
      assert.doesNotThrow(() => model.register(fixture('ollama')))
    })
  })
})
