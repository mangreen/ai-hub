import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { anthropicMessage, createAnthropicProvider } from './client.ts'

function fakeFetch(status: number, body: unknown) {
  let lastCall: { url: string; init: RequestInit } | undefined
  const fn = async (url: string, init: RequestInit) => {
    lastCall = { url, init }
    return new Response(JSON.stringify(body), { status })
  }
  return { fn, getLastCall: () => lastCall }
}

describe('anthropicMessage', () => {
  test('should_return_text_when_request_succeeds', async () => {
    const { fn } = fakeFetch(200, { model: 'claude-sonnet-5', content: [{ type: 'text', text: 'hi there' }] })
    const result = await anthropicMessage(
      { apiKey: 'sk-ant-test', fetchImpl: fn as unknown as typeof fetch },
      'claude-sonnet-5',
      [{ role: 'user', content: 'hello' }],
    )
    assert.equal(result.content, 'hi there')
    assert.equal(result.model, 'claude-sonnet-5')
  })

  test('should_send_xapikey_and_anthropic_version_headers', async () => {
    const { fn, getLastCall } = fakeFetch(200, { content: [{ type: 'text', text: 'x' }] })
    await anthropicMessage(
      { apiKey: 'sk-ant-test', fetchImpl: fn as unknown as typeof fetch },
      'm',
      [{ role: 'user', content: 'hi' }],
    )
    const headers = getLastCall()!.init.headers as Record<string, string>
    assert.equal(headers['x-api-key'], 'sk-ant-test')
    assert.equal(typeof headers['anthropic-version'], 'string')
  })

  test('should_move_system_message_to_top_level_system_field', async () => {
    const { fn, getLastCall } = fakeFetch(200, { content: [{ type: 'text', text: 'x' }] })
    await anthropicMessage(
      { apiKey: 'k', fetchImpl: fn as unknown as typeof fetch },
      'm',
      [
        { role: 'system', content: 'be concise' },
        { role: 'user', content: 'hi' },
      ],
    )
    const body = JSON.parse(getLastCall()!.init.body as string)
    assert.equal(body.system, 'be concise')
    assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }])
  })

  test('should_include_max_tokens_since_anthropic_requires_it', async () => {
    const { fn, getLastCall } = fakeFetch(200, { content: [{ type: 'text', text: 'x' }] })
    await anthropicMessage({ apiKey: 'k', fetchImpl: fn as unknown as typeof fetch }, 'm', [
      { role: 'user', content: 'hi' },
    ])
    const body = JSON.parse(getLastCall()!.init.body as string)
    assert.equal(typeof body.max_tokens, 'number')
  })

  test('should_fallback_to_requested_model_when_response_omits_model_field', async () => {
    const { fn } = fakeFetch(200, { content: [{ type: 'text', text: 'x' }] })
    const result = await anthropicMessage({ apiKey: 'k', fetchImpl: fn as unknown as typeof fetch }, 'requested', [
      { role: 'user', content: 'hi' },
    ])
    assert.equal(result.model, 'requested')
  })

  test('should_throw_when_response_not_ok', async () => {
    const { fn } = fakeFetch(401, { error: 'invalid key' })
    await assert.rejects(() =>
      anthropicMessage({ apiKey: 'bad', fetchImpl: fn as unknown as typeof fetch }, 'm', [
        { role: 'user', content: 'hi' },
      ]),
    )
  })

  test('should_throw_when_response_missing_text_block', async () => {
    const { fn } = fakeFetch(200, { content: [] })
    await assert.rejects(() =>
      anthropicMessage({ apiKey: 'k', fetchImpl: fn as unknown as typeof fetch }, 'm', [
        { role: 'user', content: 'hi' },
      ]),
    )
  })
})

describe('createAnthropicProvider', () => {
  test('should_expose_claude_as_name', () => {
    const provider = createAnthropicProvider({ apiKey: 'k' })
    assert.equal(provider.name, 'claude')
  })
})
