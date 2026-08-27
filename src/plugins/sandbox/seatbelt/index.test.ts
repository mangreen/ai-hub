import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { buildSeatbeltProfile, createSeatbeltExecutor, type SpawnFn, type SpawnedProcess } from './index.ts'

describe('buildSeatbeltProfile — pure profile text, no process involved', () => {
  test('should_deny_by_default', () => {
    const profile = buildSeatbeltProfile('/tmp/workspace')
    assert.match(profile, /\(deny default\)/)
  })

  test('should_allow_writes_within_the_workspace', () => {
    const profile = buildSeatbeltProfile('/tmp/workspace')
    assert.match(profile, /\(allow file-write\* \(subpath "\/tmp\/workspace"\)\)/)
  })

  test('should_deny_writes_to_git_hooks_even_inside_the_workspace', () => {
    const profile = buildSeatbeltProfile('/tmp/workspace')
    assert.match(profile, /\(deny file-write\* \(subpath "\/tmp\/workspace\/\.git\/hooks"\)\)/)
  })

  test('should_deny_writes_to_git_config_even_inside_the_workspace', () => {
    const profile = buildSeatbeltProfile('/tmp/workspace')
    assert.match(profile, /\(deny file-write\* \(literal "\/tmp\/workspace\/\.git\/config"\)\)/)
  })

  test('should_allow_process_fork_and_exec_since_no_command_can_run_without_them', () => {
    const profile = buildSeatbeltProfile('/tmp/workspace')
    assert.match(profile, /\(allow process-fork\)/)
    assert.match(profile, /\(allow process-exec\)/)
  })
})

/** Minimal fake matching the SpawnedProcess shape our executor actually uses. */
function fakeSpawn(result: { stdout?: string; stderr?: string; exitCode: number }): { fn: SpawnFn; getLastCall: () => { command: string; args: string[]; options: unknown } | undefined } {
  let lastCall: { command: string; args: string[]; options: unknown } | undefined
  const fn: SpawnFn = (command, args, options) => {
    lastCall = { command, args, options }
    const child = new EventEmitter() as unknown as SpawnedProcess & EventEmitter
    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    ;(child as unknown as { stdout: EventEmitter }).stdout = stdout
    ;(child as unknown as { stderr: EventEmitter }).stderr = stderr
    ;(child as unknown as { kill: () => void }).kill = () => {}
    setImmediate(() => {
      if (result.stdout) stdout.emit('data', Buffer.from(result.stdout))
      if (result.stderr) stderr.emit('data', Buffer.from(result.stderr))
      child.emit('close', result.exitCode)
    })
    return child
  }
  return { fn, getLastCall: () => lastCall }
}

describe('SeatbeltExecutor.isAvailable', () => {
  // Deliberately deterministic regardless of which OS runs the test suite —
  // the original version of this test hardcoded an assumption ("this dev
  // machine is Linux") as if it were a universal invariant, which broke the
  // moment someone ran it on macOS. See MEM-20260821-seatbelt-realpath-fix.md.
  test('should_report_true_when_platform_is_darwin', async () => {
    const executor = createSeatbeltExecutor({ workspaceDir: '/tmp/workspace', platformImpl: 'darwin' })
    assert.equal(await executor.isAvailable(), true)
  })

  test('should_report_false_when_platform_is_not_darwin', async () => {
    const executor = createSeatbeltExecutor({ workspaceDir: '/tmp/workspace', platformImpl: 'linux' })
    assert.equal(await executor.isAvailable(), false)
  })
})

describe('SeatbeltExecutor.execute — invocation shape only (mocked spawn)', () => {
  test('should_invoke_sandbox_exec_with_dash_p_and_the_generated_profile', async () => {
    const { fn, getLastCall } = fakeSpawn({ stdout: '', exitCode: 0 })
    const executor = createSeatbeltExecutor({ workspaceDir: '/tmp/workspace', spawnImpl: fn, realpathImpl: (p) => p })
    await executor.execute({ command: 'echo', args: ['hi'] })
    const call = getLastCall()!
    assert.equal(call.command, 'sandbox-exec')
    assert.equal(call.args[0], '-p')
    assert.match(call.args[1], /\(deny default\)/)
    assert.deepEqual(call.args.slice(2), ['echo', 'hi'])
  })

  test('should_default_cwd_to_workspaceDir_when_not_specified', async () => {
    const { fn, getLastCall } = fakeSpawn({ exitCode: 0 })
    const executor = createSeatbeltExecutor({ workspaceDir: '/tmp/workspace', spawnImpl: fn, realpathImpl: (p) => p })
    await executor.execute({ command: 'pwd', args: [] })
    assert.equal((getLastCall()!.options as { cwd?: string }).cwd, '/tmp/workspace')
  })

  test('should_use_explicit_cwd_when_request_provides_one', async () => {
    const { fn, getLastCall } = fakeSpawn({ exitCode: 0 })
    const executor = createSeatbeltExecutor({ workspaceDir: '/tmp/workspace', spawnImpl: fn, realpathImpl: (p) => p })
    await executor.execute({ command: 'pwd', args: [], cwd: '/tmp/other' })
    assert.equal((getLastCall()!.options as { cwd?: string }).cwd, '/tmp/other')
  })

  test('should_resolve_with_stdout_stderr_exitCode_from_the_child_process', async () => {
    const { fn } = fakeSpawn({ stdout: 'hello\n', stderr: 'warn\n', exitCode: 0 })
    const executor = createSeatbeltExecutor({ workspaceDir: '/tmp/workspace', spawnImpl: fn, realpathImpl: (p) => p })
    const result = await executor.execute({ command: 'echo', args: ['hello'] })
    assert.equal(result.stdout, 'hello\n')
    assert.equal(result.stderr, 'warn\n')
    assert.equal(result.exitCode, 0)
    assert.ok(result.durationMs >= 0)
  })

  test('should_resolve_with_nonzero_exitCode_when_command_fails_rather_than_throw', async () => {
    const { fn } = fakeSpawn({ stderr: 'not found\n', exitCode: 127 })
    const executor = createSeatbeltExecutor({ workspaceDir: '/tmp/workspace', spawnImpl: fn, realpathImpl: (p) => p })
    const result = await executor.execute({ command: 'nonexistent-cmd', args: [] })
    assert.equal(result.exitCode, 127)
  })

  test('should_reject_when_spawn_itself_errors', async () => {
    const fn: SpawnFn = () => {
      const child = new EventEmitter() as unknown as SpawnedProcess & EventEmitter
      ;(child as unknown as { stdout: null }).stdout = null
      ;(child as unknown as { stderr: null }).stderr = null
      ;(child as unknown as { kill: () => void }).kill = () => {}
      setImmediate(() => child.emit('error', new Error('spawn ENOENT')))
      return child
    }
    const executor = createSeatbeltExecutor({ workspaceDir: '/tmp/workspace', spawnImpl: fn, realpathImpl: (p) => p })
    await assert.rejects(() => executor.execute({ command: 'sandbox-exec', args: [] }))
  })
})

describe('SeatbeltExecutor.execute — workspaceDir symlink resolution (the macOS /var vs /private/var bug)', () => {
  // Real bug, found by actually running scripts/verify-seatbelt.ts on macOS
  // (not something this Linux dev environment could have caught): os.tmpdir()
  // on macOS returns a path through the /var symlink, but sandbox-exec's SBPL
  // subpath matching compares against the RESOLVED path (/private/var/...).
  // Without resolving first, "(allow file-write* (subpath "/var/..."))" simply
  // never matches, and writes inside the "workspace" get denied. See
  // memory/MEM-20260821-seatbelt-realpath-fix.md.
  test('should_build_the_profile_using_the_realpath_resolved_workspaceDir', async () => {
    const { fn, getLastCall } = fakeSpawn({ exitCode: 0 })
    const executor = createSeatbeltExecutor({
      workspaceDir: '/var/folders/xyz',
      spawnImpl: fn,
      realpathImpl: (p) => `/private${p}`, // simulates real macOS symlink resolution
    })
    await executor.execute({ command: 'echo', args: ['hi'] })
    const profile = getLastCall()!.args[1]
    assert.match(profile, /\(allow file-write\* \(subpath "\/private\/var\/folders\/xyz"\)\)/)
    assert.doesNotMatch(profile, /\(subpath "\/var\/folders\/xyz"\)/)
  })

  test('should_use_the_resolved_path_as_default_cwd_too', async () => {
    const { fn, getLastCall } = fakeSpawn({ exitCode: 0 })
    const executor = createSeatbeltExecutor({
      workspaceDir: '/var/folders/xyz',
      spawnImpl: fn,
      realpathImpl: (p) => `/private${p}`,
    })
    await executor.execute({ command: 'pwd', args: [] })
    assert.equal((getLastCall()!.options as { cwd?: string }).cwd, '/private/var/folders/xyz')
  })

  test('should_leave_the_path_unchanged_when_it_is_already_resolved', async () => {
    const { fn, getLastCall } = fakeSpawn({ exitCode: 0 })
    const executor = createSeatbeltExecutor({
      workspaceDir: '/home/user/project',
      spawnImpl: fn,
      realpathImpl: (p) => p, // no symlink involved — identity
    })
    await executor.execute({ command: 'echo', args: ['hi'] })
    assert.match(getLastCall()!.args[1], /\(subpath "\/home\/user\/project"\)/)
  })
})
