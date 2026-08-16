import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    chat: ChatService
  }
  interface Events {
    // Emitted whenever ANY message enters a room — from the Web UI, an Agent,
    // or (from Phase 8 onward) an external channel adapter. Downstream code
    // should never need to know which source it came from.
    'chat/message'(payload: { roomId: string; from: string; content: string }): void
  }
}

/**
 * Owns Room/Message state. Empty shell for Phase 1 — real persistence-backed
 * logic (sandbox visibility rules, membership, etc.) lands in Phase 2 (domain)
 * and Phase 4 (storage adapter).
 */
export class ChatService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'chat')
  }

  // TODO(Phase 2): createRoom, addMember, listMessages, sandbox visibility rules
  // TODO(Phase 2): messages must carry an optional `sourceChannel` field —
  //   see docs/adr/ADR-0002-channel-gateway.md — so a message from WhatsApp
  //   and a message typed in the Web UI are the same shape downstream.
}
