import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { buildDockerArgs, createDockerExecutor, type SpawnFn, type SpawnedProcess } from './index.ts'

describe('buildDockerArgs — pure command construction, no process involved', () => {
  test('should_include_rm_and_network_none_by_default', () => {
    const args = buildDockerArgs({ workspaceDir: '/tmp/ws', image: 'node:22-slim' }, { command: 'echo', args: ['hi'] })
    assert.ok(args.includes('--rm'))
    const netIdx = args.indexOf('--network')
    assert.equal(args[netIdx + 1], 'none')
  })

  test('should_mount_workspaceDir_to_slash_workspace_and_set_workdir', () => {
    const args = buildDockerArgs({ workspaceDir: '/tmp/ws', image: 'node:22-slim' }, { command: 'pwd', args: [] })
    const volIdx = args.indexOf('-v')
    assert.equal(args[volIdx + 1], '/tmp/ws:/workspace')
    const wIdx = args.indexOf('-w')
    assert.equal(args[wIdx + 1], '/workspace')
  })

  test('should_apply_default_resource_limits', () => {
    const args = buildDockerArgs({ workspaceDir: '/tmp/ws', image: 'node:22-slim' }, { command: 'x', args: [] })
    assert.ok(args.includes('--memory'))
    assert.ok(args.includes('--cpus'))
  })

  test('should_use_configured_resource_limits_when_provided', () => {
    const args = buildDockerArgs(
      { workspaceDir: '/tmp/ws', image: 'node:22-slim', memory: '1g', cpus: '2' },
      { command: 'x', args: [] },
    )
    assert.equal(args[args.indexOf('--memory') + 1], '1g')
    assert.equal(args[args.indexOf('--cpus') + 1], '2')
  })

  test('should_place_image_then_command_then_args_at_the_end', () => {
    const args = buildDockerArgs({ workspaceDir: '/tmp/ws', image: 'node:22-slim' }, { command: 'echo', args: ['a', 'b'] })
    assert.deepEqual(args.slice(-4), ['node:22-slim', 'echo', 'a', 'b'])
  })

  test('should_use_configured_image', () => {
    const args = buildDockerArgs({ workspaceDir: '/tmp/ws', image: 'alpine:3.20' }, { command: 'x', args: [] })
    assert.ok(args.includes('alpine:3.20'))
  })
})

/** Same fake shape used by the Seatbelt tests — records the invocation and emits a canned result. */
function fakeSpawn(result: { stdout?: string; stderr?: string; exitCode: number; errorOnStart?: boolean }): {
  fn: SpawnFn
  getLastCall: () => { command: string; args: string[] } | undefined
} {
  let lastCall: { command: string; args: string[] } | undefined
  const fn: SpawnFn = (command, args) => {
    lastCall = { command, args }
    const child = new EventEmitter() as unknown as SpawnedProcess & EventEmitter
    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    ;(child as unknown as { stdout: EventEmitter }).stdout = stdout
    ;(child as unknown as { stderr: EventEmitter }).stderr = stderr
    ;(child as unknown as { kill: () => void }).kill = () => {}
    setImmediate(() => {
      if (result.errorOnStart) {
        child.emit('error', new Error('spawn docker ENOENT'))
        return
      }
      if (result.stdout) stdout.emit('data', Buffer.from(result.stdout))
      if (result.stderr) stderr.emit('data', Buffer.from(result.stderr))
      child.emit('close', result.exitCode)
    })
    return child
  }
  return { fn, getLastCall: () => lastCall }
}

describe('DockerExecutor.isAvailable', () => {
  test('should_report_false_when_docker_binary_is_missing', async () => {
    // Genuinely true on this dev machine — no Docker installed here at all.
    const { fn } = fakeSpawn({ exitCode: 0, errorOnStart: true })
    const executor = createDockerExecutor({ workspaceDir: '/tmp/ws', image: 'node:22-slim', spawnImpl: fn })
    assert.equal(await executor.isAvailable(), false)
  })

  test('should_report_true_when_docker_version_check_succeeds', async () => {
    const { fn } = fakeSpawn({ stdout: '24.0.0\n', exitCode: 0 })
    const executor = createDockerExecutor({ workspaceDir: '/tmp/ws', image: 'node:22-slim', spawnImpl: fn })
    assert.equal(await executor.isAvailable(), true)
  })

  test('should_report_false_when_docker_daemon_check_exits_nonzero', async () => {
    const { fn } = fakeSpawn({ stderr: 'Cannot connect to the Docker daemon\n', exitCode: 1 })
    const executor = createDockerExecutor({ workspaceDir: '/tmp/ws', image: 'node:22-slim', spawnImpl: fn })
    assert.equal(await executor.isAvailable(), false)
  })
})

describe('DockerExecutor.execute — invocation shape only (mocked spawn)', () => {
  test('should_invoke_docker_run_with_the_built_args', async () => {
    const { fn, getLastCall } = fakeSpawn({ stdout: 'hi\n', exitCode: 0 })
    const executor = createDockerExecutor({ workspaceDir: '/tmp/ws', image: 'node:22-slim', spawnImpl: fn })
    await executor.execute({ command: 'echo', args: ['hi'] })
    const call = getLastCall()!
    assert.equal(call.command, 'docker')
    assert.equal(call.args[0], 'run')
    assert.deepEqual(call.args.slice(-2), ['echo', 'hi'])
  })

  test('should_resolve_with_stdout_stderr_exitCode_from_the_container', async () => {
    const { fn } = fakeSpawn({ stdout: 'out\n', stderr: 'err\n', exitCode: 0 })
    const executor = createDockerExecutor({ workspaceDir: '/tmp/ws', image: 'node:22-slim', spawnImpl: fn })
    const result = await executor.execute({ command: 'echo', args: ['out'] })
    assert.equal(result.stdout, 'out\n')
    assert.equal(result.stderr, 'err\n')
    assert.equal(result.exitCode, 0)
  })

  test('should_resolve_with_nonzero_exitCode_when_command_fails_rather_than_throw', async () => {
    const { fn } = fakeSpawn({ stderr: 'not found\n', exitCode: 127 })
    const executor = createDockerExecutor({ workspaceDir: '/tmp/ws', image: 'node:22-slim', spawnImpl: fn })
    const result = await executor.execute({ command: 'nonexistent-cmd', args: [] })
    assert.equal(result.exitCode, 127)
  })

  test('should_reject_when_docker_itself_fails_to_start', async () => {
    const { fn } = fakeSpawn({ exitCode: 0, errorOnStart: true })
    const executor = createDockerExecutor({ workspaceDir: '/tmp/ws', image: 'node:22-slim', spawnImpl: fn })
    await assert.rejects(() => executor.execute({ command: 'echo', args: ['hi'] }))
  })
})
