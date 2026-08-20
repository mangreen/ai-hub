import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createRoom, createMessage, addMember, isMember, canAgentViewRoom } from './domain.ts'

describe('createRoom', () => {
  test('should_create_room_when_name_is_valid', () => {
    const room = createRoom({ id: 'room-1', name: 'System Dev Plan' })
    assert.equal(room.id, 'room-1')
    assert.equal(room.name, 'System Dev Plan')
    assert.deepEqual(room.memberIds, [])
    assert.equal(room.isolated, false) // default: not isolated unless specified
  })

  test('should_respect_explicit_isolated_flag_when_provided', () => {
    const room = createRoom({ id: 'room-1', name: 'Private', isolated: true })
    assert.equal(room.isolated, true)
  })

  test('should_throw_when_name_is_empty', () => {
    assert.throws(() => createRoom({ id: 'room-1', name: '' }))
  })

  test('should_throw_when_name_is_whitespace_only', () => {
    assert.throws(() => createRoom({ id: 'room-1', name: '   ' }))
  })

  test('should_throw_when_id_is_empty', () => {
    assert.throws(() => createRoom({ id: '', name: 'Valid Name' }))
  })
})

describe('createMessage', () => {
  test('should_default_sourceChannel_to_null_when_not_provided', () => {
    const msg = createMessage({ id: 'm-1', roomId: 'room-1', senderId: 'agent-1', content: 'hi' })
    assert.equal(msg.sourceChannel, null)
  })

  test('should_keep_explicit_sourceChannel_when_provided', () => {
    const msg = createMessage({
      id: 'm-1', roomId: 'room-1', senderId: 'agent-1', content: 'hi', sourceChannel: 'whatsapp',
    })
    assert.equal(msg.sourceChannel, 'whatsapp')
  })

  test('should_throw_when_content_is_empty', () => {
    assert.throws(() => createMessage({ id: 'm-1', roomId: 'room-1', senderId: 'agent-1', content: '' }))
  })

  test('should_throw_when_content_is_whitespace_only', () => {
    assert.throws(() => createMessage({ id: 'm-1', roomId: 'room-1', senderId: 'agent-1', content: '  \n ' }))
  })
})

describe('addMember / isMember', () => {
  test('should_add_new_member_when_not_already_present', () => {
    const room = createRoom({ id: 'room-1', name: 'Team' })
    const updated = addMember(room, 'agent-allen')
    assert.deepEqual(updated.memberIds, ['agent-allen'])
  })

  test('should_not_mutate_original_room_when_adding_member', () => {
    const room = createRoom({ id: 'room-1', name: 'Team' })
    addMember(room, 'agent-allen')
    assert.deepEqual(room.memberIds, []) // original untouched — pure function
  })

  test('should_not_duplicate_member_when_added_twice', () => {
    const room = createRoom({ id: 'room-1', name: 'Team' })
    const once = addMember(room, 'agent-allen')
    const twice = addMember(once, 'agent-allen')
    assert.deepEqual(twice.memberIds, ['agent-allen'])
  })

  test('should_report_true_when_agent_is_member', () => {
    const room = addMember(createRoom({ id: 'room-1', name: 'Team' }), 'agent-allen')
    assert.equal(isMember(room, 'agent-allen'), true)
  })

  test('should_report_false_when_agent_is_not_member', () => {
    const room = createRoom({ id: 'room-1', name: 'Team' })
    assert.equal(isMember(room, 'agent-ben'), false)
  })
})

describe('canAgentViewRoom — isolation visibility truth table', () => {
  test('should_allow_when_member_and_room_isolated', () => {
    const room = addMember(createRoom({ id: 'r', name: 'x', isolated: true }), 'a1')
    assert.equal(canAgentViewRoom(room, { agentId: 'a1', canPeek: false }), true)
  })

  test('should_allow_when_member_and_room_not_isolated', () => {
    const room = addMember(createRoom({ id: 'r', name: 'x', isolated: false }), 'a1')
    assert.equal(canAgentViewRoom(room, { agentId: 'a1', canPeek: false }), true)
  })

  test('should_deny_when_not_member_and_room_isolated_even_if_agent_can_peek', () => {
    const room = createRoom({ id: 'r', name: 'x', isolated: true })
    assert.equal(canAgentViewRoom(room, { agentId: 'outsider', canPeek: true }), false)
  })

  test('should_deny_when_not_member_and_room_not_isolated_but_agent_cannot_peek', () => {
    const room = createRoom({ id: 'r', name: 'x', isolated: false })
    assert.equal(canAgentViewRoom(room, { agentId: 'outsider', canPeek: false }), false)
  })

  test('should_allow_when_not_member_and_room_not_isolated_and_agent_can_peek', () => {
    const room = createRoom({ id: 'r', name: 'x', isolated: false })
    assert.equal(canAgentViewRoom(room, { agentId: 'outsider', canPeek: true }), true)
  })
})
