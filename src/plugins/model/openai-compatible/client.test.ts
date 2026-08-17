import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { chatCompletion, createOpenAICompatibleProvider } from './client.ts'

/** Minimal fake fetch — records the last call and returns a canned Response. */
function fakeFetch(status: number, body: unknown) {
  let lastCall: { url: string; init: RequestInit } | undefined
  const fn = async (url: string, init: RequestInit) => {
    lastCall = { url, init }
    return new Response(JSON.stringify(body), { status })
  }
  return { fn, getLastCall: () => lastCall }
}

describe('chatCompletion', () => {
  test('should_return_content_when_request_succeeds', async () => {
    const { fn } = fakeFetch(200, { model: 'gpt-5.5', choices: [{ message: { content: 'hi there' } }] })
    const result = await chatCompletion(
      { baseURL: 'https://api.example.com/v1', fetchImpl: fn as unknown as typeof fetch },
      'gpt-5.5',
      [{ role: 'user', content: 'hello' }],
    )
    assert.equal(result.content, 'hi there')
    assert.equal(result.model, 'gpt-5.5')
  })

  test('should_include_authorization_header_when_apiKey_provided', async () => {
    const { fn, getLastCall } = fakeFetch(200, { choices: [{ message: { content: 'x' } }] })
    await chatCompletion(
      { baseURL: 'https://api.example.com/v1', apiKey: 'sk-test', fetchImpl: fn as unknown as typeof fetch },
      'm',
      [{ role: 'user', content: 'hi' }],
    )
    const headers = getLastCall()!.init.headers as Record<string, string>
    assert.equal(headers.Authorization, 'Bearer sk-test')
  })

  test('should_omit_authorization_header_when_apiKey_not_provided', async () => {
    const { fn, getLastCall } = fakeFetch(200, { choices: [{ message: { content: 'x' } }] })
    await chatCompletion(
      { baseURL: 'http://localhost:11434/v1', fetchImpl: fn as unknown as typeof fetch },
      'llama3',
      [{ role: 'user', content: 'hi' }],
    )
    const headers = getLastCall()!.init.headers as Record<string, string>
    assert.equal('Authorization' in headers, false)
  })

  test('should_post_to_chat_completions_path_under_baseURL', async () => {
    const { fn, getLastCall } = fakeFetch(200, { choices: [{ message: { content: 'x' } }] })
    await chatCompletion(
      { baseURL: 'https://api.example.com/v1', fetchImpl: fn as unknown as typeof fetch },
      'm',
      [{ role: 'user', content: 'hi' }],
    )
    assert.equal(getLastCall()!.url, 'https://api.example.com/v1/chat/completions')
  })

  test('should_fallback_to_requested_model_when_response_omits_model_field', async () => {
    const { fn } = fakeFetch(200, { choices: [{ message: { content: 'x' } }] })
    const result = await chatCompletion(
      { baseURL: 'https://api.example.com/v1', fetchImpl: fn as unknown as typeof fetch },
      'requested-model',
      [{ role: 'user', content: 'hi' }],
    )
    assert.equal(result.model, 'requested-model')
  })

  test('should_throw_when_response_not_ok', async () => {
    const { fn } = fakeFetch(401, { error: 'invalid key' })
    await assert.rejects(() =>
      chatCompletion(
        { baseURL: 'https://api.example.com/v1', fetchImpl: fn as unknown as typeof fetch },
        'm',
        [{ role: 'user', content: 'hi' }],
      ),
    )
  })

  test('should_throw_when_response_missing_choices_content', async () => {
    const { fn } = fakeFetch(200, { choices: [] })
    await assert.rejects(() =>
      chatCompletion(
        { baseURL: 'https://api.example.com/v1', fetchImpl: fn as unknown as typeof fetch },
        'm',
        [{ role: 'user', content: 'hi' }],
      ),
    )
  })
})

describe('createOpenAICompatibleProvider', () => {
  test('should_expose_given_name', () => {
    const provider = createOpenAICompatibleProvider('ollama', { baseURL: 'http://localhost:11434/v1' })
    assert.equal(provider.name, 'ollama')
  })

  test('should_delegate_complete_to_chatCompletion', async () => {
    const { fn } = fakeFetch(200, { choices: [{ message: { content: 'delegated' } }] })
    const provider = createOpenAICompatibleProvider('ollama', {
      baseURL: 'http://localhost:11434/v1',
      fetchImpl: fn as unknown as typeof fetch,
    })
    const result = await provider.complete([{ role: 'user', content: 'hi' }], 'llama3')
    assert.equal(result.content, 'delegated')
  })
})
