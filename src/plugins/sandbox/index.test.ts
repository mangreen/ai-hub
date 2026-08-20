import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { SandboxService, type SandboxExecutor } from './index.ts'

/** Minimal SandboxExecutor fixture — these tests only exercise the registry, never execute(). */
function fixture(name: string, available = true): SandboxExecutor {
  return {
    name,
    isAvailable: async () => available,
    execute: async () => ({ stdout: '', stderr: '', exitCode: 0, durationMs: 0 }),
  }
}

/** Same bridging pattern used throughout this project since Phase 1. */
function withSandboxService(fn: (sandbox: SandboxService) => void | Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctx = new Context()
    ctx.plugin(SandboxService)
    ctx.plugin({
      name: 'test-consumer',
      inject: ['sandbox'],
      async apply(ctx: Context) {
        try {
          await fn(ctx.sandbox)
          resolve()
        } catch (err) {
          reject(err)
        }
      },
    })
  })
}

describe('SandboxService.register', () => {
  test('should_list_registered_executor_when_registered', async () => {
    await withSandboxService((sandbox) => {
      sandbox.register(fixture('seatbelt'))
      assert.deepEqual(sandbox.list(), ['seatbelt'])
    })
  })

  test('should_throw_when_registering_duplicate_name', async () => {
    await withSandboxService((sandbox) => {
      sandbox.register(fixture('seatbelt'))
      assert.throws(() => sandbox.register(fixture('seatbelt')))
    })
  })

  test('should_get_executor_by_name_when_registered', async () => {
    await withSandboxService((sandbox) => {
      const executor = fixture('seatbelt')
      sandbox.register(executor)
      assert.equal(sandbox.get('seatbelt'), executor)
    })
  })

  test('should_return_undefined_when_executor_not_registered', async () => {
    await withSandboxService((sandbox) => {
      assert.equal(sandbox.get('nonexistent'), undefined)
    })
  })

  test('should_remove_executor_when_returned_disposer_is_called', async () => {
    await withSandboxService(async (sandbox) => {
      const dispose = sandbox.register(fixture('seatbelt'))
      assert.deepEqual(sandbox.list(), ['seatbelt'])
      await dispose()
      assert.deepEqual(sandbox.list(), [])
    })
  })
})

describe('SandboxExecutor.isAvailable — documents the contract, not real platform detection yet', () => {
  test('should_report_availability_per_executor', async () => {
    await withSandboxService(async (sandbox) => {
      sandbox.register(fixture('seatbelt', true))
      sandbox.register(fixture('bwrap', false))
      assert.equal(await sandbox.get('seatbelt')!.isAvailable(), true)
      assert.equal(await sandbox.get('bwrap')!.isAvailable(), false)
    })
  })
})
