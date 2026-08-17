import { Context } from 'cordis'
import { createOpenAICompatibleProvider } from '../openai-compatible/client.ts'

export const name = 'openai-provider'
export const inject = ['model']

export function apply(ctx: Context) {
  ctx.model.register(
    createOpenAICompatibleProvider('openai', {
      baseURL: 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY,
    }),
  )
}
