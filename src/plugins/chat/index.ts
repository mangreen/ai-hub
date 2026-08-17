import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    chat: ChatService
  }
  interface Events {
    // Not yet emitted by anything — reserved contract for Phase 4, when
    // ChatService actually persists messages. Once wired up: fires for ANY
    // message entering a room, regardless of source (Web UI, an Agent, or
    // an external channel adapter from Phase 8), so downstream listeners
    // never need to know which source it came from.
    'chat/message'(payload: { roomId: string; from: string; content: string }): void
  }
}

/**
 * Owns Room/Message state. The pure domain rules (Room/Message shape,
 * sandbox visibility) already exist in ./domain.ts and are fully tested —
 * this class is still an empty shell because it has nothing to hold that
 * state yet. Phase 4 wires domain.ts's functions to real persistence
 * (SQLite) here; only then will this class grow real methods.
 */
export class ChatService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'chat')
  }

  // TODO(Phase 4): createRoom/addMember/listMessages backed by ctx.storage,
  // using createRoom/addMember/canAgentViewRoom from ./domain.ts rather than
  // reimplementing those rules here.
}
