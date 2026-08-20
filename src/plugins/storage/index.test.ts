import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import { StorageService } from './index.ts'

let attachmentsDir: string

before(() => {
  process.env.AI_HUB_DB_PATH = ':memory:'
  attachmentsDir = mkdtempSync(join(tmpdir(), 'ai-hub-attachments-'))
  process.env.AI_HUB_ATTACHMENTS_DIR = attachmentsDir
})

after(() => {
  rmSync(attachmentsDir, { recursive: true, force: true })
})

/** Same bridging pattern used throughout this project since Phase 1. */
function withStorage(fn: (storage: StorageService) => void | Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctx = new Context()
    ctx.plugin(StorageService)
    ctx.plugin({
      name: 'test-consumer',
      inject: ['storage'],
      async apply(ctx: Context) {
        try {
          await fn(ctx.storage)
          resolve()
        } catch (err) {
          reject(err)
        }
      },
    })
  })
}

describe('StorageService schema', () => {
  test('should_create_all_phase_0_to_5_tables_on_construction', async () => {
    await withStorage((storage) => {
      const tables = storage
        .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .map((t) => t.name)
        .sort()
      assert.deepEqual(tables, [
        'activity_log',
        'agents',
        'attachments',
        'messages',
        'room_members',
        'rooms',
        'task_node_runs',
        'workflow_definitions',
        'workflow_runs',
      ])
    })
  })

  test('should_create_indexes_on_activity_log_for_search', async () => {
    await withStorage((storage) => {
      const indexes = storage
        .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'activity_log'")
        .map((i) => i.name)
      // sqlite auto-names some indexes; just check our named ones exist.
      for (const expected of ['idx_activity_log_workflow_run', 'idx_activity_log_agent', 'idx_activity_log_kind', 'idx_activity_log_target', 'idx_activity_log_started_at']) {
        assert.ok(indexes.includes(expected), `expected index ${expected} to exist`)
      }
    })
  })
})

describe('StorageService workflow tables (Phase 5)', () => {
  test('should_store_and_retrieve_workflow_definition_json', async () => {
    await withStorage((storage) => {
      storage.run('INSERT INTO rooms (id, name, isolated) VALUES (?, ?, ?)', ['r1', 'Team', 0])
      const definitionJson = JSON.stringify({ nodes: [{ id: 'n1', agentId: 'a1', task: 'do x' }], edges: [] })
      storage.run(
        'INSERT INTO workflow_definitions (id, name, room_id, definition_json, sandbox_executor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['wf1', 'Build it', 'r1', definitionJson, null, new Date().toISOString(), new Date().toISOString()],
      )
      const row = storage.get<{ definition_json: string }>('SELECT definition_json FROM workflow_definitions WHERE id = ?', ['wf1'])
      assert.deepEqual(JSON.parse(row!.definition_json), { nodes: [{ id: 'n1', agentId: 'a1', task: 'do x' }], edges: [] })
    })
  })

  test('should_link_workflow_run_to_definition_via_foreign_key', async () => {
    await withStorage((storage) => {
      storage.run('INSERT INTO rooms (id, name, isolated) VALUES (?, ?, ?)', ['r1', 'Team', 0])
      storage.run(
        'INSERT INTO workflow_definitions (id, name, room_id, definition_json, sandbox_executor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['wf1', 'Build it', 'r1', '{}', null, new Date().toISOString(), new Date().toISOString()],
      )
      storage.run('INSERT INTO workflow_runs (id, workflow_id, status, started_at, finished_at) VALUES (?, ?, ?, ?, ?)', [
        'run1', 'wf1', 'running', new Date().toISOString(), null,
      ])
      const row = storage.get<{ workflow_id: string }>('SELECT workflow_id FROM workflow_runs WHERE id = ?', ['run1'])
      assert.equal(row?.workflow_id, 'wf1')
    })
  })

  test('should_record_activity_log_entry_with_searchable_fields', async () => {
    await withStorage((storage) => {
      storage.run('INSERT INTO rooms (id, name, isolated) VALUES (?, ?, ?)', ['r1', 'Team', 0])
      storage.run(
        'INSERT INTO workflow_definitions (id, name, room_id, definition_json, sandbox_executor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['wf1', 'Build it', 'r1', '{}', null, new Date().toISOString(), new Date().toISOString()],
      )
      storage.run('INSERT INTO workflow_runs (id, workflow_id, status, started_at, finished_at) VALUES (?, ?, ?, ?, ?)', [
        'run1', 'wf1', 'running', new Date().toISOString(), null,
      ])
      storage.run(
        'INSERT INTO activity_log (id, workflow_run_id, task_node_run_id, agent_id, kind, target, started_at, finished_at, duration_ms, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['log1', 'run1', null, 'agent-allen', 'model_call', 'openrouter:nvidia/nemotron', new Date().toISOString(), null, null, 'running', null],
      )
      const found = storage.all<{ id: string }>('SELECT id FROM activity_log WHERE kind = ? AND target LIKE ?', ['model_call', 'openrouter:%'])
      assert.equal(found.length, 1)
    })
  })
})

describe('StorageService.run/get/all', () => {
  test('should_insert_and_retrieve_a_row', async () => {
    await withStorage((storage) => {
      storage.run('INSERT INTO rooms (id, name, isolated) VALUES (?, ?, ?)', ['r1', 'Team', 0])
      const row = storage.get<{ id: string; name: string }>('SELECT * FROM rooms WHERE id = ?', ['r1'])
      assert.equal(row?.name, 'Team')
    })
  })

  test('should_return_undefined_when_get_finds_no_row', async () => {
    await withStorage((storage) => {
      const row = storage.get('SELECT * FROM rooms WHERE id = ?', ['nonexistent'])
      assert.equal(row, undefined)
    })
  })

  test('should_return_all_matching_rows', async () => {
    await withStorage((storage) => {
      storage.run('INSERT INTO rooms (id, name, isolated) VALUES (?, ?, ?)', ['r1', 'A', 0])
      storage.run('INSERT INTO rooms (id, name, isolated) VALUES (?, ?, ?)', ['r2', 'B', 0])
      const rows = storage.all<{ id: string }>('SELECT * FROM rooms ORDER BY id')
      assert.deepEqual(rows.map((r) => r.id), ['r1', 'r2'])
    })
  })

  test('should_throw_when_unique_constraint_violated', async () => {
    await withStorage((storage) => {
      storage.run('INSERT INTO rooms (id, name, isolated) VALUES (?, ?, ?)', ['dup', 'A', 0])
      assert.throws(() => storage.run('INSERT INTO rooms (id, name, isolated) VALUES (?, ?, ?)', ['dup', 'B', 0]))
    })
  })
})

describe('StorageService.saveAttachment', () => {
  test('should_write_file_to_attachments_dir_and_return_record', async () => {
    await withStorage((storage) => {
      storage.run('INSERT INTO rooms (id, name, isolated) VALUES (?, ?, ?)', ['r1', 'Team', 0])
      storage.run('INSERT INTO messages (id, room_id, sender_id, content, source_channel, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
        'm1', 'r1', 'agent-1', 'see attached', null, new Date().toISOString(),
      ])

      const record = storage.saveAttachment('m1', 'notes.txt', 'text/plain', Buffer.from('hello world'))

      assert.equal(record.messageId, 'm1')
      assert.equal(record.filename, 'notes.txt')
      assert.equal(record.mimeType, 'text/plain')
      assert.equal(record.sizeBytes, 11)
      assert.equal(readFileSync(record.storagePath, 'utf-8'), 'hello world')
    })
  })

  test('should_persist_attachment_row_queryable_via_get', async () => {
    await withStorage((storage) => {
      storage.run('INSERT INTO rooms (id, name, isolated) VALUES (?, ?, ?)', ['r2', 'Team', 0])
      storage.run('INSERT INTO messages (id, room_id, sender_id, content, source_channel, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
        'm2', 'r2', 'agent-1', 'see attached', null, new Date().toISOString(),
      ])
      const record = storage.saveAttachment('m2', 'a.png', 'image/png', Buffer.from([1, 2, 3]))
      const row = storage.get<{ id: string }>('SELECT * FROM attachments WHERE id = ?', [record.id])
      assert.equal(row?.id, record.id)
    })
  })
})
