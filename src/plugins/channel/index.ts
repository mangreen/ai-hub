import { Context, Service } from 'cordis'

export interface ChannelMessageContent {
  text: string
  // TODO(Phase 8): attachments — must line up with each platform's own
  // media upload flow (e.g. WhatsApp requires a separate media_id step).
}

export interface ChannelAdapter {
  /** e.g. 'whatsapp' | 'messenger' | 'wecom' — see ADR-0002 for why not 'wechat-personal' */
  name: string
  sendMessage(externalTarget: string, content: ChannelMessageContent): Promise<void>
}

declare module 'cordis' {
  interface Context {
    channel: ChannelService
  }
  interface Events {
    // Any channel adapter emits this on inbound messages. Agent orchestration
    // (Phase 5) subscribes here without caring which platform it came from —
    // same decoupling pattern demonstrated in the deleted Phase 0 event
    // demo (see git branch phase/0-environment-cordis-basics).
    'channel/message-received'(payload: {
      channel: string
      externalUserId: string
      content: ChannelMessageContent
    }): void
  }
}

/**
 * Registry for external channel adapters (WhatsApp / Messenger / 企業微信).
 * Empty shell — see docs/adr/ADR-0002-channel-gateway.md for the full
 * reasoning. Real adapters (webhook receivers + send clients) are Phase 8
 * work; this just reserves the boundary. It already paid off once: Phase 2's
 * Message type carries `sourceChannel` from the start because this registry
 * existed before Phase 2's domain design was written.
 */
export class ChannelService extends Service {
  private adapters = new Map<string, ChannelAdapter>()

  constructor(ctx: Context) {
    super(ctx, 'channel')
  }

  /**
   * Registers an adapter. Registration is a Cordis effect: the returned
   * disposer unregisters it — same contract as ModelService.register(), see
   * that file's JSDoc for why.
   */
  register(adapter: ChannelAdapter) {
    return this.ctx.effect(() => {
      if (this.adapters.has(adapter.name)) {
        throw new Error(`channel adapter "${adapter.name}" already registered`)
      }
      this.adapters.set(adapter.name, adapter)
      return () => {
        this.adapters.delete(adapter.name)
      }
    })
  }

  /** Returns the registered adapter, or `undefined` if no adapter with this name is registered. */
  get(name: string): ChannelAdapter | undefined {
    return this.adapters.get(name)
  }

  /** Names of all currently registered adapters, in registration order. */
  list(): string[] {
    return [...this.adapters.keys()]
  }

  // TODO(Phase 8): each adapter needs to register an inbound webhook route.
  // That requires a future ctx.api (HTTP router) service from Phase 6 —
  // revisit this method once that exists.
}
