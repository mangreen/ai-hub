import { Context } from 'cordis'
import { spawn as realSpawn } from 'node:child_process'
import type { SandboxExecutor, SandboxExecutionRequest, SandboxExecutionResult } from '../index.ts'

export const name = 'docker-executor'
export const inject = ['sandbox']

/**
 * Registers the Docker executor — see ADR-0006's addendum on why Docker
 * joins Seatbelt/bwrap/Landlock/cloud-API: this project already knows
 * Docker Desktop has friction on Big Sur (CLAUDE.md Section 0), but an
 * already-working local install (confirmed: Docker Desktop 4.12.0, Engine
 * 20.10.17) sidesteps that entirely — no Colima/OrbStack workaround needed.
 * `workspaceDir` defaults to the process's cwd, matching Seatbelt's default.
 */
export function apply(ctx: Context) {
  ctx.sandbox.register(createDockerExecutor({ workspaceDir: process.cwd(), image: 'node:22-slim' }))
}

/** Same minimal shape as Seatbelt's — see that file's comment for why it's not Node's full ChildProcess type. */
export interface SpawnedProcess {
  stdout: { on(event: 'data', cb: (chunk: Buffer) => void): void } | null
  stderr: { on(event: 'data', cb: (chunk: Buffer) => void): void } | null
  on(event: 'close', cb: (code: number | null) => void): void
  on(event: 'error', cb: (err: Error) => void): void
  kill(): void
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> },
) => SpawnedProcess

export interface DockerConfig {
  /** Host directory bind-mounted to /workspace inside the container — the only host filesystem the container can see. */
  workspaceDir: string
  /** Image commands run inside. No default at the type level — apply() picks 'node:22-slim' since this project is Node-centric, but that's a policy choice, not a Docker requirement. */
  image: string
  /** Docker's --memory syntax, e.g. '512m', '1g'. Default: '512m'. */
  memory?: string
  /** Docker's --cpus syntax, e.g. '1', '0.5'. Default: '1'. */
  cpus?: string
  /** Injectable for tests — defaults to node:child_process's real spawn. */
  spawnImpl?: SpawnFn
}

const defaultSpawn: SpawnFn = (command, args, options) =>
  realSpawn(command, args, options) as unknown as SpawnedProcess

/**
 * Pure — builds the `docker run` argument list. `--network none` and the
 * single workspace bind mount are the actual isolation boundary: the
 * container's own filesystem (from `image`) is normal but ephemeral
 * (discarded on exit via `--rm`), and nothing on the host outside
 * `workspaceDir` is ever visible to it. This is coarser-grained than
 * Seatbelt's path-pattern rules, which also makes it simpler to get right —
 * there's no equivalent of Seatbelt's file-write-unlink bypass concern,
 * since there's no host path to rename INTO from inside the container.
 *
 * KNOWN LIMITATION (v1): no `--read-only` on the container's own
 * filesystem — a command could still write anywhere inside the container
 * (just not on the host). Acceptable for v1 since that's thrown away with
 * `--rm`, but worth knowing if a command needs write-protection guarantees
 * beyond "the host stays clean".
 */
export function buildDockerArgs(config: DockerConfig, request: SandboxExecutionRequest): string[] {
  return [
    'run',
    '--rm',
    '--network',
    'none',
    '--memory',
    config.memory ?? '512m',
    '--cpus',
    config.cpus ?? '1',
    '-v',
    `${config.workspaceDir}:/workspace`,
    '-w',
    '/workspace',
    config.image,
    request.command,
    ...request.args,
  ]
}

export function createDockerExecutor(config: DockerConfig): SandboxExecutor {
  return {
    name: 'docker',
    /**
     * Actually runs `docker version` to check both that the CLI exists AND
     * the daemon is reachable — a missing binary and a stopped daemon are
     * both "not available", and this is the one executor in this project
     * whose isAvailable() we could plausibly test against a real daemon,
     * just not on this particular (Docker-less) dev machine.
     */
    async isAvailable() {
      try {
        const result = await runViaDocker(config, { command: '__version_check__', args: [] }, ['version'])
        return result.exitCode === 0
      } catch {
        return false
      }
    },
    execute: (request) => runViaDocker(config, request),
  }
}

/**
 * @throws if the `docker` process itself fails to start (e.g. missing
 * binary) — a nonzero exitCode from the command it ran is NOT a throw,
 * that's a normal result.
 */
function runViaDocker(
  config: DockerConfig,
  request: SandboxExecutionRequest,
  overrideArgs?: string[],
): Promise<SandboxExecutionResult> {
  const spawnFn = config.spawnImpl ?? defaultSpawn
  const args = overrideArgs ?? buildDockerArgs(config, request)
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const child = spawnFn('docker', args, { env: request.env })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)

    let timer: ReturnType<typeof setTimeout> | undefined
    if (request.timeoutMs) {
      timer = setTimeout(() => child.kill(), request.timeoutMs)
    }

    child.on('close', (exitCode) => {
      if (timer) clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: exitCode ?? -1, durationMs: Date.now() - startedAt })
    })
  })
}
