import { Context, Service } from 'cordis'
import type { ChatMessage, ChatCompletionResult } from './types.ts'

export interface ModelProvider {
  name: string
  /** @throws if the underlying request fails or returns a response this provider can't parse. */
  complete(messages: ChatMessage[], model: string): Promise<ChatCompletionResult>
}

declare module 'cordis' {
  interface Context {
    model: ModelService
  }
}

/**
 * Registry for model providers. This is deliberately a *working* registry
 * already (not just a stub) — Phase 3 plugins (one per provider) will call
 * ctx.model.register(...) rather than us hard-coding provider knowledge here.
 */
export class ModelService extends Service {
  private providers = new Map<string, ModelProvider>()

  constructor(ctx: Context) {
    super(ctx, 'model')
  }

  /**
   * Registers a provider. Registration is a Cordis effect: the returned
   * disposer unregisters it (and can be awaited). A provider plugin that
   * unloads should call its own disposer so a stale provider can't linger.
   */
  register(provider: ModelProvider) {
    return this.ctx.effect(() => {
      if (this.providers.has(provider.name)) {
        throw new Error(`model provider "${provider.name}" already registered`)
      }
      this.providers.set(provider.name, provider)
      return () => {
        this.providers.delete(provider.name)
      }
    })
  }

  /** Returns the registered provider, or `undefined` if no provider with this name is registered. */
  get(name: string): ModelProvider | undefined {
    return this.providers.get(name)
  }

  /** Names of all currently registered providers, in registration order. */
  list(): string[] {
    return [...this.providers.keys()]
  }
}
