import { Context } from 'cordis'

// Cordis events are how plugins talk to each other WITHOUT depending on
// each other directly — this is the mechanism Phase 5 (multi-agent loop)
// will use for agent-to-agent messages (e.g. 'agent/task-assigned').
declare module 'cordis' {
  interface Events {
    'agent/message'(payload: { from: string; to: string; text: string }): void
  }
}

export const name = 'event-demo'

export function apply(ctx: Context) {
  ctx.on('agent/message', (payload) => {
    console.log(`[event] ${payload.from} -> ${payload.to}: ${payload.text}`)
  })

  ctx.emit('agent/message', { from: 'Allen', to: 'Ben', text: 'frontend contract is ready' })
}
