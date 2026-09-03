import { Context } from 'cordis'
import { promises as fs } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import type { ToolResult } from '../index.ts'

export const name = 'coding-filesystem-tools'
export const inject = ['tool']

const MAX_READ_BYTES = 256 * 1024
const MAX_WRITE_BYTES = 1024 * 1024
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'coverage', '.cache'])

export function apply(ctx: Context) {
  ctx.tool.register({
    name: 'list_files',
    description: 'List files and directories under the assigned workspace. Use this first to understand an unfamiliar repository.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Directory relative to workspace root. Default ".".' } },
      additionalProperties: false,
    },
    execute: async (args, context) => {
      const path = stringArg(args, 'path', '.')
      const absolute = safePath(context.workspaceRoot, path)
      const entries = await fs.readdir(absolute, { withFileTypes: true })
      const visible = entries
        .filter((entry) => entry.isDirectory() ? !IGNORED_DIRS.has(entry.name) : true)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => `${entry.isDirectory() ? 'dir ' : 'file'} ${entry.name}`)
      return { content: visible.join('\n') || '(empty)' }
    },
  })

  ctx.tool.register({
    name: 'read_file',
    description: 'Read a UTF-8 text file from the workspace. Returns at most 256 KiB.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
    execute: async (args, context) => {
      const path = stringArg(args, 'path')
      const absolute = safePath(context.workspaceRoot, path)
      const stat = await fs.stat(absolute)
      if (!stat.isFile()) return { content: `${path} is not a file`, isError: true }
      if (stat.size > MAX_READ_BYTES) return { content: `${path} is too large to read (${stat.size} bytes)`, isError: true }
      return { content: await fs.readFile(absolute, 'utf8') }
    },
  })

  ctx.tool.register({
    name: 'write_file',
    description: 'Create or replace a UTF-8 text file inside the workspace. Parent directories are created automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    execute: async (args, context) => {
      const object = recordArg(args)
      const path = stringArg(object, 'path')
      const content = stringArg(object, 'content')
      if (Buffer.byteLength(content, 'utf8') > MAX_WRITE_BYTES) {
        return { content: `refusing to write ${path}: content exceeds ${MAX_WRITE_BYTES} bytes`, isError: true }
      }
      const absolute = safePath(context.workspaceRoot, path)
      await fs.mkdir(dirname(absolute), { recursive: true })
      await fs.writeFile(absolute, content, 'utf8')
      return { content: `wrote ${path} (${Buffer.byteLength(content, 'utf8')} bytes)` }
    },
  })

  ctx.tool.register({
    name: 'search_files',
    description: 'Search text files recursively inside the workspace. Good for locating existing implementations, tests, and configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        path: { type: 'string', description: 'Optional directory relative to workspace root. Default ".".' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (args, context) => {
      const object = recordArg(args)
      const query = stringArg(object, 'query')
      const start = safePath(context.workspaceRoot, stringArg(object, 'path', '.'))
      const results: string[] = []
      await walk(start, context.workspaceRoot, query, results)
      return { content: results.slice(0, 200).join('\n') || 'no matches' }
    },
  })
}

async function walk(dir: string, workspaceRoot: string, query: string, results: string[]) {
  if (results.length >= 200) return
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (results.length >= 200) return
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      await walk(resolve(dir, entry.name), workspaceRoot, query, results)
      continue
    }
    if (!entry.isFile()) continue
    const absolute = resolve(dir, entry.name)
    const stat = await fs.stat(absolute)
    if (stat.size > MAX_READ_BYTES) continue
    const content = await fs.readFile(absolute, 'utf8')
    const lines = content.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (line.includes(query) && results.length < 200) {
        results.push(`${relative(workspaceRoot, absolute)}:${index + 1}:${line.slice(0, 400)}`)
      }
    })
  }
}

function safePath(workspaceRoot: string, requested: string): string {
  const absoluteRoot = resolve(workspaceRoot)
  const candidate = resolve(absoluteRoot, requested)
  const rel = relative(absoluteRoot, candidate)
  if (rel === '' || (!rel.startsWith('..' + '/') && rel !== '..' && !rel.startsWith('/') && !/^[A-Za-z]:/.test(rel))) {
    return candidate
  }
  throw new Error(`path escapes workspace: ${requested}`)
}

function recordArg(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('tool arguments must be an object')
  return value as Record<string, unknown>
}

function stringArg(args: unknown, key: string, fallback?: string): string {
  const object = typeof args === 'object' && args !== null && !Array.isArray(args) ? args as Record<string, unknown> : {}
  const value = object[key]
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== 'string') throw new Error(`tool argument "${key}" must be a string`)
  return value
}
