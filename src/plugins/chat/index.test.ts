import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { ChatService } from './index.ts'
import { StorageService } from '../storage/index.ts'

before(() => {
  process.env.AI_HUB_DB_PATH = ':memory:'
})

/** Same bridging pattern used throughout this project since Phase 1. */
function withChat(fn: (chat: ChatService) => void | Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctx = new Context()
    ctx.plugin(StorageService)
    ctx.plugin(ChatService)
    ctx.plugin({
      name: 'test-consumer',
      inject: ['chat', 'storage'],
      async apply(ctx: Context) {
        try {
          await fn(ctx.chat)
          resolve()
        } catch (err) {
          reject(err)
        }
      },
    })
  })
}

describe('ChatService.createRoom / getRoom', () => {
  test('should_persist_room_when_created', async () => {
    await withChat((chat) => {
      chat.createRoom('r1', 'Team Chat')
      const room = chat.getRoom('r1')
      assert.equal(room?.name, 'Team Chat')
      assert.equal(room?.isolated, false)
      assert.deepEqual(room?.memberIds, [])
    })
  })

  test('should_throw_when_creating_room_with_blank_name', async () => {
    await withChat((chat) => {
      assert.throws(() => chat.createRoom('r1', ''))
    })
  })

  test('should_return_undefined_when_room_not_found', async () => {
    await withChat((chat) => {
      assert.equal(chat.getRoom('nonexistent'), undefined)
    })
  })
})

describe('ChatService.addMember', () => {
  test('should_persist_membership_when_added', async () => {
    await withChat((chat) => {
      chat.createRoom('r1', 'Team')
      chat.addMember('r1', 'agent-allen')
      assert.deepEqual(chat.getRoom('r1')?.memberIds, ['agent-allen'])
    })
  })

  test('should_not_duplicate_membership_when_added_twice', async () => {
    await withChat((chat) => {
      chat.createRoom('r1', 'Team')
      chat.addMember('r1', 'agent-allen')
      chat.addMember('r1', 'agent-allen')
      assert.deepEqual(chat.getRoom('r1')?.memberIds, ['agent-allen'])
    })
  })

  test('should_throw_when_room_does_not_exist', async () => {
    await withChat((chat) => {
      assert.throws(() => chat.addMember('nonexistent', 'agent-allen'))
    })
  })
})

describe('ChatService.postMessage / listMessages', () => {
  test('should_persist_message_and_list_it', async () => {
    await withChat((chat) => {
      chat.createRoom('r1', 'Team')
      chat.postMessage('m1', 'r1', 'agent-allen', 'hello')
      const messages = chat.listMessages('r1')
      assert.equal(messages.length, 1)
      assert.equal(messages[0].content, 'hello')
      assert.equal(messages[0].sourceChannel, null)
    })
  })

  test('should_keep_sourceChannel_when_provided', async () => {
    await withChat((chat) => {
      chat.createRoom('r1', 'Team')
      chat.postMessage('m1', 'r1', 'agent-allen', 'hi from whatsapp', 'whatsapp')
      assert.equal(chat.listMessages('r1')[0].sourceChannel, 'whatsapp')
    })
  })

  test('should_list_messages_in_chronological_order', async () => {
    await withChat((chat) => {
      chat.createRoom('r1', 'Team')
      chat.postMessage('m1', 'r1', 'agent-allen', 'first')
      chat.postMessage('m2', 'r1', 'agent-ben', 'second')
      const messages = chat.listMessages('r1')
      assert.deepEqual(messages.map((m) => m.id), ['m1', 'm2'])
    })
  })

  test('should_throw_when_posting_to_nonexistent_room', async () => {
    await withChat((chat) => {
      assert.throws(() => chat.postMessage('m1', 'nonexistent', 'agent-allen', 'hi'))
    })
  })

  test('should_emit_chat_message_event_when_message_posted', async () => {
    await new Promise<void>((resolve, reject) => {
      const ctx = new Context()
      ctx.plugin(StorageService)
      ctx.plugin(ChatService)
      ctx.plugin({
        name: 'test-consumer',
        inject: ['chat', 'storage'],
        apply(ctx: Context) {
          try {
            let received: unknown
            ctx.on('chat/message', (payload) => {
              received = payload
            })
            ctx.chat.createRoom('r1', 'Team')
            ctx.chat.postMessage('m1', 'r1', 'agent-allen', 'hello')
            assert.deepEqual(received, { roomId: 'r1', from: 'agent-allen', content: 'hello' })
            resolve()
          } catch (err) {
            reject(err)
          }
        },
      })
    })
  })
})

describe('ChatService.canAgentViewRoom', () => {
  test('should_allow_when_agent_is_member', async () => {
    await withChat((chat) => {
      chat.createRoom('r1', 'Team', true)
      chat.addMember('r1', 'agent-allen')
      assert.equal(chat.canAgentViewRoom('r1', { agentId: 'agent-allen', canPeek: false }), true)
    })
  })

  test('should_deny_when_not_member_and_room_isolated', async () => {
    await withChat((chat) => {
      chat.createRoom('r1', 'Team', true)
      assert.equal(chat.canAgentViewRoom('r1', { agentId: 'outsider', canPeek: true }), false)
    })
  })

  test('should_throw_when_room_does_not_exist', async () => {
    await withChat((chat) => {
      assert.throws(() => chat.canAgentViewRoom('nonexistent', { agentId: 'a', canPeek: false }))
    })
  })
})
