import { Context } from 'cordis'
import { createOpenAICompatibleProvider } from '../openai-compatible/client.ts'

export const name = 'nvidia-nim-provider'
export const inject = ['model']

/** build.nvidia.com hosted NIM catalog — OpenAI-compatible, backed by vLLM's OpenAI-Compatible Server. */
export function apply(ctx: Context) {
  ctx.model.register(
    createOpenAICompatibleProvider('nvidia-nim', {
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY,
    }),
  )
}
