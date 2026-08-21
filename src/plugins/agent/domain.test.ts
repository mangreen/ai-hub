import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createAgent, assignTask, parseModelRef } from './domain.ts'

describe('createAgent', () => {
  test('should_create_agent_when_all_fields_valid', () => {
    const agent = createAgent({ id: 'agent-1', name: 'Allen', modelRef: 'anthropic:claude' })
    assert.equal(agent.id, 'agent-1')
    assert.equal(agent.name, 'Allen')
    assert.equal(agent.modelRef, 'anthropic:claude')
    assert.equal(agent.canPeek, false) // default: isolated by default (secure by default)
  })

  test('should_respect_explicit_canPeek_when_provided', () => {
    const agent = createAgent({ id: 'agent-1', name: 'Fallon', modelRef: 'kimi:k2', canPeek: true })
    assert.equal(agent.canPeek, true)
  })

  test('should_throw_when_name_is_empty', () => {
    assert.throws(() => createAgent({ id: 'agent-1', name: '', modelRef: 'ollama:llama3' }))
  })

  test('should_throw_when_modelRef_is_empty', () => {
    assert.throws(() => createAgent({ id: 'agent-1', name: 'Ben', modelRef: '' }))
  })
})

describe('parseModelRef', () => {
  test('should_split_on_first_colon', () => {
    const parsed = parseModelRef('anthropic:claude-sonnet-5')
    assert.equal(parsed.provider, 'anthropic')
    assert.equal(parsed.model, 'claude-sonnet-5')
  })

  test('should_keep_remaining_colons_as_part_of_model_when_model_name_itself_contains_a_colon', () => {
    // real OpenRouter model names look like this — see .tmp/test-openrouter.ts
    const parsed = parseModelRef('openrouter:nvidia/nemotron-3-ultra-550b-a55b:free')
    assert.equal(parsed.provider, 'openrouter')
    assert.equal(parsed.model, 'nvidia/nemotron-3-ultra-550b-a55b:free')
  })

  test('should_throw_when_there_is_no_colon', () => {
    assert.throws(() => parseModelRef('justamodel'))
  })

  test('should_throw_when_provider_part_is_empty', () => {
    assert.throws(() => parseModelRef(':model'))
  })

  test('should_throw_when_model_part_is_empty', () => {
    assert.throws(() => parseModelRef('provider:'))
  })
})

describe('assignTask', () => {
  test('should_create_assignment_when_agents_differ_and_task_is_valid', () => {
    const assignment = assignTask('agent-fallon', 'agent-allen', 'write the login form')
    assert.equal(assignment.fromAgentId, 'agent-fallon')
    assert.equal(assignment.toAgentId, 'agent-allen')
    assert.equal(assignment.task, 'write the login form')
  })

  test('should_throw_when_assigning_task_to_self', () => {
    assert.throws(() => assignTask('agent-allen', 'agent-allen', 'review own code'))
  })

  test('should_throw_when_task_is_empty', () => {
    assert.throws(() => assignTask('agent-fallon', 'agent-allen', ''))
  })

  test('should_throw_when_task_is_whitespace_only', () => {
    assert.throws(() => assignTask('agent-fallon', 'agent-allen', '   '))
  })
})
