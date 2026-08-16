import { Context, Service } from 'cordis'

export interface ModelProvider {
  name: string
  // TODO(Phase 3): complete(prompt, options) — actual per-provider implementation
  // (Ollama / OpenAI-compatible endpoints for Claude, GPT, Gemini, Grok, NVIDIA build)
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

  register(provider: ModelProvider) {
    if (this.providers.has(provider.name)) {
      throw new Error(`model provider "${provider.name}" already registered`)
    }
    this.providers.set(provider.name, provider)
  }

  get(name: string): ModelProvider | undefined {
    return this.providers.get(name)
  }

  list(): string[] {
    return [...this.providers.keys()]
  }
}
