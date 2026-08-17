import { Context } from 'cordis'
import { createOpenAICompatibleProvider } from '../openai-compatible/client.ts'

export const name = 'grok-provider'
export const inject = ['model']

/** xAI's standard API surface IS OpenAI-compatible — there's no separate native format. */
export function apply(ctx: Context) {
  ctx.model.register(
    createOpenAICompatibleProvider('grok', {
      baseURL: 'https://api.x.ai/v1',
      apiKey: process.env.XAI_API_KEY,
    }),
  )
}
