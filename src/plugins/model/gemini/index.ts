import { Context } from 'cordis'
import { createOpenAICompatibleProvider } from '../openai-compatible/client.ts'

export const name = 'gemini-provider'
export const inject = ['model']

/** Google's OpenAI-compat endpoint — documented as a supported, production feature, not a testing shim. */
export function apply(ctx: Context) {
  ctx.model.register(
    createOpenAICompatibleProvider('gemini', {
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: process.env.GEMINI_API_KEY,
    }),
  )
}
