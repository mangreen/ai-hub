import { Context } from 'cordis'
import { spawn as realSpawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import type { SandboxExecutor, SandboxExecutionRequest, SandboxExecutionResult } from '../index.ts'

export const name = 'seatbelt-executor'
export const inject = ['sandbox']

/**
 * Registers the Seatbelt (macOS `sandbox-exec`) executor. `workspaceDir`
 * defaults to the process's cwd — the one directory writes are allowed
 * into. See ADR-0006 for why Seatbelt despite being Apple-deprecated.
 */
export function apply(ctx: Context) {
  ctx.sandbox.register(createSeatbeltExecutor({ workspaceDir: process.cwd() }))
}

/** Minimal shape of what we actually use from a spawned child process — not Node's full ChildProcess type, so a test fake doesn't have to implement dozens of unused members. */
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

export interface SeatbeltConfig {
  /** The one directory writes are allowed into — see buildSeatbeltProfile(). Resolved via realpathImpl before use; see that field's doc. */
  workspaceDir: string
  /** Injectable for tests — defaults to node:child_process's real spawn. */
  spawnImpl?: SpawnFn
  /**
   * Injectable for tests — defaults to `process.platform`. Exists because
   * `isAvailable()` needs to be testable for BOTH branches (darwin/not)
   * regardless of which OS actually runs the test suite; without this, a
   * test asserting one hardcoded answer breaks the moment someone runs it
   * on the other kind of machine — which is exactly what happened here
   * (see MEM-20260821-seatbelt-realpath-fix.md).
   */
  platformImpl?: NodeJS.Platform
  /**
   * Injectable for tests — defaults to `fs.realpathSync`. Exists because
   * `workspaceDir` needs to be resolved to its REAL filesystem path before
   * being baked into the SBPL profile: on macOS, `os.tmpdir()` returns a
   * path through the `/var` symlink (itself a symlink to `/private/var`),
   * but `sandbox-exec`'s `(subpath "...")` matching compares against the
   * resolved path — so an unresolved workspaceDir silently fails to match
   * its own allow-rule, and writes inside the "workspace" get denied. Found
   * by actually running scripts/verify-seatbelt.ts on real macOS (this dev
   * environment is Linux and could not have caught this) — see
   * MEM-20260821-seatbelt-realpath-fix.md for the full story.
   */
  realpathImpl?: (path: string) => string
}

const defaultSpawn: SpawnFn = (command, args, options) =>
  realSpawn(command, args, options) as unknown as SpawnedProcess

/**
 * Pure — builds the SBPL profile text passed to `sandbox-exec -p`. Verified
 * against Apple/Chromium SBPL syntax and Anthropic's own production
 * `sandbox-runtime` project (which uses this exact `-p <profile>` CLI
 * pattern), not guessed — see MEM-20260821-phase5.5-seatbelt-docker-executors.md.
 *
 * Deny-by-default, then an explicit allow-list for the workspace, with
 * mandatory denies for git hooks/config even within that allowed workspace
 * — this "allow-list + mandatory denials for dangerous paths" shape mirrors
 * Anthropic's own approach.
 *
 * Deliberately takes `workspaceDir` as a plain string and does no path
 * resolution itself (stays pure, no I/O, testable with fake paths) — the
 * caller (runViaSeatbelt) is responsible for passing an already-resolved
 * real path. See SeatbeltConfig.realpathImpl's doc for why that matters.
 *
 * KNOWN LIMITATIONS (v1, documented rather than hidden — see ADR-0006's
 * "no security theater" principle):
 * - Network is NOT explicitly allowed, so `(deny default)` blocks it —
 *   commands needing network access aren't supported by this executor yet.
 * - Does NOT yet defend against the file-write-unlink bypass (renaming a
 *   file to escape a write restriction) that Anthropic's sandbox-runtime
 *   specifically guards against. A real gap, not an oversight to hide.
 */
export function buildSeatbeltProfile(workspaceDir: string): string {
  return [
    '(version 1)',
    '(deny default)',
    '(allow process-fork)',
    '(allow process-exec)',
    '(allow file-read*)',
    `(allow file-write* (subpath "${workspaceDir}"))`,
    `(deny file-write* (subpath "${workspaceDir}/.git/hooks"))`,
    `(deny file-write* (literal "${workspaceDir}/.git/config"))`,
  ].join('\n')
}

export function createSeatbeltExecutor(config: SeatbeltConfig): SandboxExecutor {
  return {
    name: 'seatbelt',
    async isAvailable() {
      return (config.platformImpl ?? process.platform) === 'darwin'
    },
    execute: (request) => runViaSeatbelt(config, request),
  }
}

/** @throws if the `sandbox-exec` process itself fails to start (e.g. missing binary) — a nonzero exitCode from the command it ran is NOT a throw, that's a normal result. */
function runViaSeatbelt(config: SeatbeltConfig, request: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
  const spawnFn = config.spawnImpl ?? defaultSpawn
  const resolvePath = config.realpathImpl ?? realpathSync
  const resolvedWorkspaceDir = resolvePath(config.workspaceDir)
  const profile = buildSeatbeltProfile(resolvedWorkspaceDir)
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const child = spawnFn('sandbox-exec', ['-p', profile, request.command, ...request.args], {
      cwd: request.cwd ?? resolvedWorkspaceDir,
      env: request.env,
    })

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
