import { Context, Service } from 'cordis'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

declare module 'cordis' {
  interface Context {
    storage: StorageService
  }
}

/**
 * Schema for all tables in one place, per dsh-doc-standards-derived
 * practice of keeping one authoritative home for a fact rather than scattering
 * DDL across files. `room_members` is a join table for Room.memberIds
 * (domain.ts keeps that as a plain array; SQL needs a normalized table).
 * `workflow_definitions`/`workflow_runs`/`task_node_runs`/`activity_log` are
 * Phase 5 (see docs/adr/ADR-0005/0007) — `definition_json` stores the DAG as
 * a JSON blob rather than normalized node/edge tables, per ADR-0007 (it's
 * always read/written as one whole document, same shape a UI graph editor
 * would send).
 */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    isolated INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT NOT NULL REFERENCES rooms(id),
    agent_id TEXT NOT NULL,
    PRIMARY KEY (room_id, agent_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    source_channel TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    model_ref TEXT NOT NULL,
    can_peek INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id),
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workflow_definitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    definition_json TEXT NOT NULL,
    sandbox_executor TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id),
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT
  );
  CREATE TABLE IF NOT EXISTS task_node_runs (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES workflow_runs(id),
    node_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
  );
  CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
    task_node_run_id TEXT REFERENCES task_node_runs(id),
    agent_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    target TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_ms INTEGER,
    status TEXT NOT NULL,
    metadata TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_activity_log_workflow_run ON activity_log(workflow_run_id);
  CREATE INDEX IF NOT EXISTS idx_activity_log_agent ON activity_log(agent_id);
  CREATE INDEX IF NOT EXISTS idx_activity_log_kind ON activity_log(kind);
  CREATE INDEX IF NOT EXISTS idx_activity_log_target ON activity_log(target);
  CREATE INDEX IF NOT EXISTS idx_activity_log_started_at ON activity_log(started_at);
`

export interface AttachmentRecord {
  id: string
  messageId: string
  filename: string
  mimeType: string
  storagePath: string
  sizeBytes: number
}

/**
 * Infrastructure adapter: owns the SQLite connection, schema, and attachment
 * file storage. Deliberately knows nothing about Room/Message/Agent as
 * domain concepts — ChatService/AgentService own that, using this service's
 * generic run/get/all methods (repository pattern; see ADR-0001's "Cordis
 * service boundary = layer" decision).
 *
 * `node:sqlite` is Node's built-in module (no external native dependency —
 * consistent with this project's Big Sur-driven bias against native-binary
 * devDependencies, see error/ERR-20260816-esbuild-bigsur-incompatible.md).
 * It's still flagged experimental by Node itself; that warning is expected.
 */
export class StorageService extends Service {
  private db: DatabaseSync
  private attachmentsDir: string

  constructor(ctx: Context) {
    super(ctx, 'storage')

    const dbPath = process.env.AI_HUB_DB_PATH || './data/ai-hub.db'
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true })
    }
    this.db = new DatabaseSync(dbPath)
    this.db.exec(SCHEMA_SQL)

    this.attachmentsDir = process.env.AI_HUB_ATTACHMENTS_DIR || './data/attachments'
    mkdirSync(this.attachmentsDir, { recursive: true })
  }

  /** @throws on constraint violations or invalid SQL — propagated as-is from node:sqlite. */
  run(sql: string, params: unknown[] = []) {
    return this.db.prepare(sql).run(...(params as never[]))
  }

  /** Returns the first matching row, or `undefined` if none match. */
  get<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined
  }

  /** Returns all matching rows (empty array if none match). */
  all<T = unknown>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...(params as never[])) as T[]
  }

  /**
   * Writes `data` to local disk under the configured attachments directory
   * and records it against `messageId`. Cloud storage is out of scope for
   * Phase 4 — see CLAUDE.md Phase 4 for why local-disk-first is the plan.
   * @throws if `messageId` doesn't reference an existing message (FK constraint).
   */
  saveAttachment(messageId: string, filename: string, mimeType: string, data: Buffer): AttachmentRecord {
    const id = randomUUID()
    const storagePath = join(this.attachmentsDir, id)
    writeFileSync(storagePath, data)

    const record: AttachmentRecord = {
      id,
      messageId,
      filename,
      mimeType,
      storagePath,
      sizeBytes: data.byteLength,
    }
    this.run(
      'INSERT INTO attachments (id, message_id, filename, mime_type, storage_path, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [record.id, record.messageId, record.filename, record.mimeType, record.storagePath, record.sizeBytes, new Date().toISOString()],
    )
    return record
  }
}
