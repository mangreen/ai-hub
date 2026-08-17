import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { ModelService } from './index.ts'
import * as ollama from './ollama/index.ts'
import * as openai from './openai/index.ts'
import * as gemini from './gemini/index.ts'
import * as grok from './grok/index.ts'
import * as nvidiaNim from './nvidia-nim/index.ts'
import * as openrouter from './openrouter/index.ts'
import * as claude from './claude/index.ts'

/**
 * Mounts ModelService plus all seven Phase 3 provider plugins together and
 * checks the registry, without making any real HTTP calls — plugin apply()
 * only calls ctx.model.register(), it never calls .complete().
 */
test('should_register_all_seven_providers_when_all_plugins_mounted', async () => {
  await new Promise<void>((resolve, reject) => {
    const ctx = new Context()
    ctx.plugin(ModelService)
    ctx.plugin(ollama)
    ctx.plugin(openai)
    ctx.plugin(gemini)
    ctx.plugin(grok)
    ctx.plugin(nvidiaNim)
    ctx.plugin(openrouter)
    ctx.plugin(claude)
    ctx.plugin({
      name: 'test-consumer',
      inject: ['model'],
      apply(ctx: Context) {
        try {
          assert.deepEqual(
            [...ctx.model.list()].sort(),
            ['claude', 'gemini', 'grok', 'nvidia-nim', 'ollama', 'openai', 'openrouter'].sort(),
          )
          resolve()
        } catch (err) {
          reject(err)
        }
      },
    })
  })
})
