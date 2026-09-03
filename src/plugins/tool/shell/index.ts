import { Context } from 'cordis'
import type { ToolResult } from '../index.ts'
import { resolve, relative } from 'node:path'
import type { SandboxExecutionResult } from '../../sandbox/index.ts'

export const name = 'coding-shell-tool'
export const inject = ['tool', 'sandbox']

export function apply(ctx: Context) {
  ctx.tool.register({
    name: 'run_command',
    description: 'Run a program in the workspace through a sandbox executor. Use direct argv, not a shell command string. Example: {"command":"pnpm","args":["test"]}.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        cwd: { type: 'string', description: 'Optional directory relative to workspace root. Default ".".' },
        timeoutMs: { type: 'number', description: 'Optional timeout, default 120000.' },
        allowNetwork: { type: 'boolean', description: 'Allow network access for dependency installation or downloads. Default false.' },
      },
      required: ['command', 'args'],
      additionalProperties: false,
    },
    execute: async (args, context) => {
      const object = recordArg(args)
      const command = stringArg(object, 'command')
      const rawArgs = object.args
      if (!Array.isArray(rawArgs) || !rawArgs.every((item) => typeof item === 'string')) {
        throw new Error('tool argument "args" must be a string array')
      }
      const cwd = stringArg(object, 'cwd', '.')
      const timeoutMs = typeof object.timeoutMs === 'number' ? object.timeoutMs : 120000
      const allowNetwork = object.allowNetwork === true
      const root = context.workspaceRoot
      const cwdPath = resolveInside(root, cwd)

      const executor = await selectExecutor(ctx, context.sandboxExecutor)
      if (!executor) {
        return { content: 'no available sandbox executor; configure Docker or Seatbelt before using run_command', isError: true }
      }

      const result: SandboxExecutionResult = await executor.execute({
        command,
        args: rawArgs as string[],
        cwd: cwdPath,
        timeoutMs,
        allowNetwork,
      })
      return formatResult(result)
    },
  })
}

async function selectExecutor(ctx: Context, requested?: string | null) {
  if (requested) {
    const executor = ctx.sandbox.get(requested)
    if (!executor) throw new Error(`sandbox executor "${requested}" is not registered`)
    if (!(await executor.isAvailable())) return undefined
    return executor
  }
  for (const name of ctx.sandbox.list()) {
    const executor = ctx.sandbox.get(name)!
    if (await executor.isAvailable()) return executor
  }
  return undefined
}

function formatResult(result: SandboxExecutionResult): ToolResult {
  const output = [
    `exit_code: ${result.exitCode}`,
    `duration_ms: ${result.durationMs}`,
    result.stdout ? `stdout:\n${truncate(result.stdout)}` : '',
    result.stderr ? `stderr:\n${truncate(result.stderr)}` : '',
  ].filter(Boolean).join('\n')
  return { content: output, isError: result.exitCode !== 0 }
}

function resolveInside(root: string, requested: string): string {
  const absoluteRoot = resolve(root)
  const candidate = resolve(absoluteRoot, requested)
  const rel = relative(absoluteRoot, candidate)
  if (rel === '..' || rel.startsWith('..' + '/') || rel.startsWith('/')) {
    throw new Error(`cwd escapes workspace: ${requested}`)
  }
  return candidate
}

function recordArg(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('tool arguments must be an object')
  return value as Record<string, unknown>
}

function stringArg(args: Record<string, unknown>, key: string, fallback?: string): string {
  const value = args[key]
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== 'string') throw new Error(`tool argument "${key}" must be a string`)
  return value
}

function truncate(value: string, max = 12000): string {
  return value.length <= max ? value : value.slice(0, max) + '\n...[truncated]'
}
