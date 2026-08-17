import type { ModelProvider } from '../index.ts'
import type { ChatMessage, ChatCompletionResult } from '../types.ts'

export interface OpenAICompatibleConfig {
  baseURL: string
  /** Omitted for endpoints that don't require auth (e.g. local Ollama). */
  apiKey?: string
  extraHeaders?: Record<string, string>
  /** Injectable for tests — defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

/**
 * Calls any OpenAI-compatible `/chat/completions` endpoint. Shared by six of
 * the seven Phase 3 providers — see docs/adr/ADR-0003-model-provider-architecture.md
 * for which six, and why Anthropic isn't one of them.
 *
 * @throws if the HTTP response isn't ok, or if it doesn't contain
 * `choices[0].message.content` as a string.
 */
export async function chatCompletion(
  config: OpenAICompatibleConfig,
  model: string,
  messages: ChatMessage[],
): Promise<ChatCompletionResult> {
  const fetchFn = config.fetchImpl ?? fetch
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.extraHeaders,
  }
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }

  const res = await fetchFn(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages }),
  })

  if (!res.ok) {
    throw new Error(`OpenAI-compatible request to ${config.baseURL} failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error(`OpenAI-compatible response from ${config.baseURL} is missing choices[0].message.content`)
  }

  return { content, model: data.model ?? model }
}

/** Wraps chatCompletion() as a ModelProvider for ctx.model.register(). */
export function createOpenAICompatibleProvider(name: string, config: OpenAICompatibleConfig): ModelProvider {
  return {
    name,
    complete: (messages, model) => chatCompletion(config, model, messages),
  }
}
