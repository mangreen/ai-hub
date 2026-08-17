import type { ModelProvider } from '../index.ts'
import type { ChatMessage, ChatCompletionResult } from '../types.ts'

export interface AnthropicConfig {
  apiKey: string
  /** Overridable only for tests; production always talks to Anthropic directly. */
  baseURL?: string
  fetchImpl?: typeof fetch
}

const DEFAULT_MAX_TOKENS = 1024
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Calls Anthropic's native Messages API — deliberately NOT the OpenAI-compat
 * shim. See docs/adr/ADR-0003-model-provider-architecture.md for why: that
 * shim is testing-only per Anthropic's own docs (no prompt caching, no
 * thinking, unguaranteed tool schemas).
 *
 * Anthropic's wire format differs from OpenAI's in two ways this function
 * bridges: a `system` role message becomes the top-level `system` field
 * (Anthropic has no 'system' role in `messages`), and `max_tokens` is
 * required (OpenAI-compatible APIs default it).
 *
 * @throws if the HTTP response isn't ok, or if it doesn't contain a
 * `content[]` block of type 'text'.
 */
export async function anthropicMessage(
  config: AnthropicConfig,
  model: string,
  messages: ChatMessage[],
  maxTokens = DEFAULT_MAX_TOKENS,
): Promise<ChatCompletionResult> {
  const fetchFn = config.fetchImpl ?? fetch
  const baseURL = config.baseURL ?? 'https://api.anthropic.com/v1'

  const system = messages.find((m) => m.role === 'system')?.content
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  const res = await fetchFn(`${baseURL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: rest,
    }),
  })

  if (!res.ok) {
    throw new Error(`Anthropic request failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  const block = data?.content?.find((b: { type: string }) => b.type === 'text')
  if (typeof block?.text !== 'string') {
    throw new Error('Anthropic response is missing a text content block')
  }

  return { content: block.text, model: data.model ?? model }
}

/** Wraps anthropicMessage() as a ModelProvider, registered under the name 'claude'. */
export function createAnthropicProvider(config: AnthropicConfig): ModelProvider {
  return {
    name: 'claude',
    complete: (messages, model) => anthropicMessage(config, model, messages),
  }
}
