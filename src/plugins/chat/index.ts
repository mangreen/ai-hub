import { Context, Service } from 'cordis'
import { createRoom, createMessage, addMember, canAgentViewRoom, type Room, type Message, type AgentVisibility } from './domain.ts'

declare module 'cordis' {
  interface Context {
    chat: ChatService
  }
  interface Events {
    // Not yet emitted by anything — reserved contract, see postMessage()'s
    // TODO. Fires for ANY message entering a room, regardless of source
    // (Web UI, an Agent, or an external channel adapter from Phase 8), so
    // downstream listeners never need to know which source it came from.
    'chat/message'(payload: { roomId: string; from: string; content: string }): void
  }
}

interface RoomRow {
  id: string
  name: string
  sandboxed: number
}

interface MessageRow {
  id: string
  room_id: string
  sender_id: string
  content: string
  source_channel: string | null
}

/**
 * Owns Room/Message persistence. Validation and business rules (sandbox
 * visibility, idempotent membership) live in the pure functions in
 * ./domain.ts — this class's job is only translating between those and
 * ctx.storage's tables, never reimplementing the rules themselves.
 */
export class ChatService extends Service {
  static inject = ['storage']

  constructor(ctx: Context) {
    super(ctx, 'chat')
  }

  private loadRoom(roomId: string): Room | undefined {
    const row = this.ctx.storage.get<RoomRow>('SELECT * FROM rooms WHERE id = ?', [roomId])
    if (!row) return undefined
    const members = this.ctx.storage.all<{ agent_id: string }>(
      'SELECT agent_id FROM room_members WHERE room_id = ?',
      [roomId],
    )
    return {
      id: row.id,
      name: row.name,
      sandboxed: !!row.sandboxed,
      memberIds: members.map((m) => m.agent_id),
    }
  }

  /** @throws if `name` is blank — see domain.ts's createRoom. */
  createRoom(id: string, name: string, sandboxed = false): Room {
    const room = createRoom({ id, name, sandboxed })
    this.ctx.storage.run('INSERT INTO rooms (id, name, sandboxed) VALUES (?, ?, ?)', [
      room.id,
      room.name,
      room.sandboxed ? 1 : 0,
    ])
    return room
  }

  getRoom(roomId: string): Room | undefined {
    return this.loadRoom(roomId)
  }

  /**
   * Idempotent — adding an existing member is a no-op, matching
   * domain.ts's addMember. @throws if the room doesn't exist.
   */
  addMember(roomId: string, agentId: string): Room {
    const room = this.loadRoom(roomId)
    if (!room) throw new Error(`room "${roomId}" does not exist`)
    const updated = addMember(room, agentId)
    this.ctx.storage.run('INSERT OR IGNORE INTO room_members (room_id, agent_id) VALUES (?, ?)', [roomId, agentId])
    return updated
  }

  /**
   * @throws if `content` is blank (domain.ts's createMessage), or if
   * `roomId` doesn't reference an existing room (FK constraint from
   * ctx.storage).
   */
  postMessage(id: string, roomId: string, senderId: string, content: string, sourceChannel: string | null = null): Message {
    const message = createMessage({ id, roomId, senderId, content, sourceChannel })
    // TODO(Phase 5+): emit 'chat/message' here once something actually
    // listens for it (multi-agent orchestration).
    this.ctx.storage.run(
      'INSERT INTO messages (id, room_id, sender_id, content, source_channel, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [message.id, message.roomId, message.senderId, message.content, message.sourceChannel, new Date().toISOString()],
    )
    return message
  }

  /** Chronological order (insertion order via `created_at`). */
  listMessages(roomId: string): Message[] {
    const rows = this.ctx.storage.all<MessageRow>(
      'SELECT * FROM messages WHERE room_id = ? ORDER BY created_at ASC',
      [roomId],
    )
    return rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      senderId: row.sender_id,
      content: row.content,
      sourceChannel: row.source_channel,
    }))
  }

  /** @throws if `roomId` doesn't reference an existing room. */
  canAgentViewRoom(roomId: string, agent: AgentVisibility): boolean {
    const room = this.loadRoom(roomId)
    if (!room) throw new Error(`room "${roomId}" does not exist`)
    return canAgentViewRoom(room, agent)
  }
}
