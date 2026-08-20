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
  test('should_create_rooms_messages_agents_attachments_tables_on_construction', async () => {
    await withStorage((storage) => {
      const tables = storage
        .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .map((t) => t.name)
        .sort()
      assert.deepEqual(tables, ['agents', 'attachments', 'messages', 'room_members', 'rooms'])
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
