import { Context } from 'cordis'
import { createAnthropicProvider } from '../anthropic/client.ts'

export const name = 'claude-provider'
export const inject = ['model']

/** Uses Anthropic's native Messages API, not its OpenAI-compat shim — see ADR-0003 for why. */
export function apply(ctx: Context) {
  ctx.model.register(createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' }))
}
