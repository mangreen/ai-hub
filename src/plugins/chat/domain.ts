/**
 * Pure domain logic for Room/Message — no I/O, no Cordis, no persistence.
 * Persistence-backed wiring happens in ChatService (Phase 4).
 */

export interface Room {
  readonly id: string
  readonly name: string
  readonly memberIds: readonly string[]
  /** If true, only members can view this room — see docs/adr/ADR-0002-channel-gateway.md */
  readonly sandboxed: boolean
}

export interface Message {
  readonly id: string
  readonly roomId: string
  readonly senderId: string
  readonly content: string
  /** Which external platform this came from, or null for AI Hub's own Web UI. */
  readonly sourceChannel: string | null
}

/** The subset of an Agent's sandbox setting relevant to this check — see agent/domain.ts for the full Agent type. */
export interface AgentVisibility {
  readonly agentId: string
  /** Whether this agent is allowed to view rooms it isn't a member of (still subject to the room's own `sandboxed` flag). */
  readonly canPeek: boolean
}

function assertNonBlank(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must not be empty`)
  }
}

/** @throws if `id` or `name` is empty/whitespace-only. */
export function createRoom(params: { id: string; name: string; sandboxed?: boolean }): Room {
  assertNonBlank(params.id, 'Room.id')
  assertNonBlank(params.name, 'Room.name')
  return {
    id: params.id,
    name: params.name,
    memberIds: [],
    sandboxed: params.sandboxed ?? false,
  }
}

/** @throws if `content` is empty/whitespace-only. */
export function createMessage(params: {
  id: string
  roomId: string
  senderId: string
  content: string
  sourceChannel?: string | null
}): Message {
  assertNonBlank(params.content, 'Message.content')
  return {
    id: params.id,
    roomId: params.roomId,
    senderId: params.senderId,
    content: params.content,
    sourceChannel: params.sourceChannel ?? null,
  }
}

/** Returns a NEW Room with the member added — never mutates the input. */
export function addMember(room: Room, agentId: string): Room {
  if (room.memberIds.includes(agentId)) return room
  return { ...room, memberIds: [...room.memberIds, agentId] }
}

export function isMember(room: Room, agentId: string): boolean {
  return room.memberIds.includes(agentId)
}

/**
 * Sandbox visibility rule (Section "沙盒模式" in CLAUDE.md):
 * a member can always see their own room; a non-member can only see it if
 * BOTH the room allows outside visibility (`!sandboxed`) AND the agent is
 * allowed to look outside its own rooms (`canPeek`).
 */
export function canAgentViewRoom(room: Room, agent: AgentVisibility): boolean {
  if (isMember(room, agent.agentId)) return true
  return !room.sandboxed && agent.canPeek
}
