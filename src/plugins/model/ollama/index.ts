import { Context } from 'cordis'
import { createOpenAICompatibleProvider } from '../openai-compatible/client.ts'

export const name = 'ollama-provider'
export const inject = ['model']

/**
 * Registers the local Ollama server. No API key: Ollama's default local
 * setup doesn't require auth. CPU-only on this project's dev hardware (2014
 * MacBook Pro, no dedicated GPU) — realistically limited to ~3B-8B
 * quantized models, per CLAUDE.md Section 0.
 */
export function apply(ctx: Context) {
  ctx.model.register(
    createOpenAICompatibleProvider('ollama', {
      baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
    }),
  )
}
