import { Context, Service } from 'cordis'

export interface SandboxExecutionRequest {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
}

export interface SandboxExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

export interface SandboxExecutor {
  /** e.g. 'seatbelt' | 'bwrap' | 'landlock' | 'docker' | 'cloud-api' — see ADR-0006 */
  name: string
  /**
   * Whether this backend actually works on the current host — e.g. a bwrap
   * executor must report `false` on macOS, not attempt to run anyway. This
   * lets a future UI (or the orchestrator) show only usable options instead
   * of ones that would fail. See ADR-0006's per-backend platform table.
   */
  isAvailable(): Promise<boolean>
  /** @throws if execution fails to start (e.g. the command isn't found) — a nonzero exitCode is NOT a throw, that's a normal result. */
  execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult>
}

declare module 'cordis' {
  interface Context {
    sandbox: SandboxService
  }
}

/**
 * Registry for execution sandbox backends. Empty shell for Phase 5 — see
 * docs/adr/ADR-0006-execution-sandbox-plugin.md for the full reasoning.
 * Concrete executors (Seatbelt, a cloud API) are Phase 5.5 work, gated on
 * this project having actual tool-calling to sandbox in the first place;
 * this just reserves the boundary, same as ctx.channel did in Phase 1 for
 * platforms that didn't arrive until Phase 8.
 */
export class SandboxService extends Service {
  private executors = new Map<string, SandboxExecutor>()

  constructor(ctx: Context) {
    super(ctx, 'sandbox')
  }

  register(executor: SandboxExecutor) {
    return this.ctx.effect(() => {
      if (this.executors.has(executor.name)) {
        throw new Error(`sandbox executor "${executor.name}" already registered`)
      }
      this.executors.set(executor.name, executor)
      return () => {
        this.executors.delete(executor.name)
      }
    })
  }

  /** Returns the registered executor, or `undefined` if no executor with this name is registered. */
  get(name: string): SandboxExecutor | undefined {
    return this.executors.get(name)
  }

  /** Names of all currently registered executors, in registration order. Not filtered by availability — check isAvailable() per executor. */
  list(): string[] {
    return [...this.executors.keys()]
  }
}
