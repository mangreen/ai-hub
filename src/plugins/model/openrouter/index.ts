import { Context } from 'cordis'
import { createOpenAICompatibleProvider } from '../openai-compatible/client.ts'

export const name = 'openrouter-provider'
export const inject = ['model']

/**
 * OpenRouter — official docs describe it as a drop-in OpenAI SDK replacement
 * (base URL swap only). HTTP-Referer/X-OpenRouter-Title are optional
 * per OpenRouter's docs (only affect leaderboard attribution), so they're
 * only sent if explicitly configured.
 */
export function apply(ctx: Context) {
  const extraHeaders: Record<string, string> = {}
  if (process.env.OPENROUTER_SITE_URL) extraHeaders['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL
  if (process.env.OPENROUTER_SITE_NAME) extraHeaders['X-OpenRouter-Title'] = process.env.OPENROUTER_SITE_NAME

  ctx.model.register(
    createOpenAICompatibleProvider('openrouter', {
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      extraHeaders,
    }),
  )
}
