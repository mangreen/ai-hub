import { Context, Service } from 'cordis'

export interface ToolExecutionContext {
  /** Absolute workspace root assigned to the current coding task. */
  workspaceRoot: string
  /** Preferred sandbox executor. null means let the tool choose an available backend. */
  sandboxExecutor?: string | null
}

export interface ToolResult {
  content: string
  isError?: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute(args: unknown, context: ToolExecutionContext): Promise<ToolResult>
}

declare module 'cordis' {
  interface Context {
    tool: ToolService
  }
}

/**
 * Registry for agent-callable tools. The registry owns only discovery and
 * dispatch; security policy and I/O stay in individual tool plugins.
 */
export class ToolService extends Service {
  private tools = new Map<string, ToolDefinition>()

  constructor(ctx: Context) {
    super(ctx, 'tool')
  }

  register(tool: ToolDefinition) {
    return this.ctx.effect(() => {
      if (this.tools.has(tool.name)) {
        throw new Error(`tool "${tool.name}" already registered`)
      }
      this.tools.set(tool.name, tool)
      return () => {
        this.tools.delete(tool.name)
      }
    })
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()]
  }

  async execute(name: string, args: unknown, context: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.get(name)
    if (!tool) throw new Error(`tool "${name}" is not registered`)
    return tool.execute(args, context)
  }
}
