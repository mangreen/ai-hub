import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { ChannelService } from './index.ts'

/** Same bridging pattern as model/index.test.ts — see that file for why. */
function withChannelService(fn: (channel: ChannelService) => void | Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctx = new Context()
    ctx.plugin(ChannelService)
    ctx.plugin({
      name: 'test-consumer',
      inject: ['channel'],
      async apply(ctx: Context) {
        try {
          await fn(ctx.channel)
          resolve()
        } catch (err) {
          reject(err)
        }
      },
    })
  })
}

describe('ChannelService.register', () => {
  test('should_list_registered_adapter_when_registered', async () => {
    await withChannelService((channel) => {
      channel.register({ name: 'whatsapp', sendMessage: async () => {} })
      assert.deepEqual(channel.list(), ['whatsapp'])
    })
  })

  test('should_throw_when_registering_duplicate_name', async () => {
    await withChannelService((channel) => {
      channel.register({ name: 'whatsapp', sendMessage: async () => {} })
      assert.throws(() => channel.register({ name: 'whatsapp', sendMessage: async () => {} }))
    })
  })

  test('should_get_adapter_by_name_when_registered', async () => {
    await withChannelService((channel) => {
      const adapter = { name: 'whatsapp', sendMessage: async () => {} }
      channel.register(adapter)
      assert.equal(channel.get('whatsapp'), adapter)
    })
  })

  test('should_remove_adapter_when_returned_disposer_is_called', async () => {
    await withChannelService(async (channel) => {
      const dispose = channel.register({ name: 'whatsapp', sendMessage: async () => {} })
      assert.deepEqual(channel.list(), ['whatsapp'])
      await dispose()
      assert.deepEqual(channel.list(), [])
    })
  })
})
