import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    storage: StorageService
  }
}

/**
 * Owns persistence (SQLite in Phase 4) and attachment storage. Empty shell
 * for Phase 1.
 */
export class StorageService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'storage')
  }

  // TODO(Phase 4): SQLite-backed rooms/messages/agents/attachments tables
}
