/**
 * Real-world integration test for the single coding-agent loop.
 *
 * Requirements:
 *   - OPENROUTER_API_KEY must be set in the environment.
 *   - Docker Desktop / Docker Engine must be running.
 *   - Run from the AI Hub repository root.
 *
 * Example:
 *   OPENROUTER_API_KEY=sk-or-v1-... node scripts/verify-real-coding-agent.ts
 *
 * The test deliberately uses a disposable workspace under .tmp/url_short/.
 * The model talks to OpenRouter over the host network; all generated-code
 * execution and dependency installation happen inside Docker.
 */

import { Context } from 'cordis'
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { ChatService } from '../src/plugins/chat/index.ts'
import { AgentService } from '../src/plugins/agent/index.ts'
import { ModelService } from '../src/plugins/model/index.ts'
import { StorageService } from '../src/plugins/storage/index.ts'
import { OrchestratorService } from '../src/plugins/orchestrator/index.ts'
import { SandboxService } from '../src/plugins/sandbox/index.ts'
import { ToolService } from '../src/plugins/tool/index.ts'
import * as openrouterProvider from '../src/plugins/model/openrouter/index.ts'
import * as codingAgentStrategy from '../src/plugins/orchestrator/coding-agent/index.ts'
import * as filesystemTools from '../src/plugins/tool/filesystem/index.ts'
import * as shellTool from '../src/plugins/tool/shell/index.ts'
import { createDockerExecutor } from '../src/plugins/sandbox/docker/index.ts'
import type { Context as CordisContext } from 'cordis'

const MODEL_REF = 'openrouter:cohere/north-mini-code:free'
const WORKSPACE = resolve(process.cwd(), '.tmp/url_short')
const ROOM_ID = `real-coding-${Date.now()}`
const AGENT_ID = `real-coding-agent-${Date.now()}`
const MAX_STEPS = Number(process.env.AI_HUB_REAL_CODING_MAX_STEPS ?? 24)

function checkPrerequisites() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is required')
  }
  const base = resolve(process.cwd())
  const rel = relative(base, WORKSPACE)
  if (rel.startsWith('..') || rel.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error(`workspace must stay under repository root: ${WORKSPACE}`)
  }
}

async function buildKernel() {
  const ctx = new Context()
  process.env.AI_HUB_DB_PATH = ':memory:'

  ctx.plugin(StorageService)
  ctx.plugin(ChatService)
  ctx.plugin(AgentService)
  ctx.plugin(ModelService)
  ctx.plugin(OrchestratorService)
  ctx.plugin(SandboxService)
  ctx.plugin(ToolService)
  ctx.plugin(openrouterProvider)
  ctx.plugin(codingAgentStrategy)
  ctx.plugin(filesystemTools)
  ctx.plugin(shellTool)
  const executor = createDockerExecutor({ workspaceDir: WORKSPACE, image: 'node:22-slim' })
  const available = await executor.isAvailable()
  console.log('isAvailable():', available)
  ctx.sandbox.register(executor)
  return ctx
}

async function run() {
  checkPrerequisites()

  rmSync(WORKSPACE, { recursive: true, force: true })
  mkdirSync(WORKSPACE, { recursive: true })

  const ctx = await buildKernel()

  await new Promise<void>((resolveReady, rejectReady) => {
    ctx.plugin({
      name: 'real-coding-agent-test',
      inject: ['storage', 'chat', 'agent', 'model', 'orchestrator', 'sandbox', 'tool'],
      async apply(ctx: CordisContext) {
        try {
          console.log('model providers:', ctx.model.list())
          console.log('orchestrators:', ctx.orchestrator.list())
          console.log('sandbox executors:', ctx.sandbox.list())
          console.log('tools:', ctx.tool.list().map((tool) => tool.name))

          const docker = ctx.sandbox.get('docker')
          if (!docker || !(await docker.isAvailable())) {
            throw new Error('Docker executor is not available. Start Docker Desktop / Docker Engine and retry.')
          }

          ctx.chat.createRoom(ROOM_ID, 'real coding agent')
          ctx.agent.createAgent(AGENT_ID, 'Real Coding Agent', MODEL_REF)

          const prompt = [
            '在 .tmp/url_short/ 下 完成一個包含精簡前後端的 url shortner。',
            '',
            '要求：',
            '1. 實作可實際啟動的 backend URL shortening API，至少能建立短網址並 redirect。',
            '2. 實作一個非常精簡、可由 backend 提供或獨立啟動的 frontend UI，可輸入 URL 並取得短網址。',
            '3. 使用 npm 管理依賴，建立 package.json 與 package-lock.json；優先保持依賴精簡。',
            '4. 請使用清楚可辨識的 server.ts（backend）與 public/index.html（frontend）作為主要入口。',
            '5. 必須建立 README.md，寫明安裝、啟動、測試方式與 API 用法。',
            '6. 必須實際執行測試、typecheck 或 build 等可執行驗證；失敗就修正後重跑。',
            '7. 需要安裝依賴時，run_command 必須設定 allowNetwork=true；其他驗證指令盡量保持 allowNetwork=false。',
            '8. 所有實作檔案必須留在 .tmp/url_short/。',
          ].join('\n')

          console.log(`\nworkspace: ${WORKSPACE}`)
          console.log(`model: ${MODEL_REF}`)
          console.log(`max steps: ${MAX_STEPS}`)
          console.log('\n--- coding-agent started ---\n')

          const result = await ctx.orchestrator.runTask('coding-agent', {
            roomId: ROOM_ID,
            prompt,
            agentId: AGENT_ID,
            workspaceRoot: WORKSPACE,
            sandboxExecutor: 'docker',
            maxSteps: MAX_STEPS,
          })

          console.log('\n--- coding-agent result ---')
          console.log(result)
          if (result.status !== 'succeeded') {
            throw new Error(`coding-agent did not succeed: ${result.status}`)
          }
          console.log('\nmodel final response:')
          console.log(result.output ?? '<empty>')

          const packageJsonPath = resolve(WORKSPACE, 'package.json')
          const readmePath = resolve(WORKSPACE, 'README.md')
          if (!existsSync(packageJsonPath)) throw new Error('verification failed: package.json was not created')
          if (!existsSync(readmePath)) throw new Error('verification failed: README.md was not created')

          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
            scripts?: Record<string, string>
            dependencies?: Record<string, string>
          }
          const scripts = packageJson.scripts ?? {}
          console.log('\npackage scripts:', scripts)

          // Run an independent post-agent verification inside Docker. This is
          // intentionally not delegated to the model's own final claim.
          const verifyCommands: Array<{ label: string; command: string; args: string[]; allowNetwork?: boolean }> = []
          if (scripts.test) verifyCommands.push({ label: 'npm test', command: 'npm', args: ['test', '--', '--runInBand'], allowNetwork: false })
          if (scripts.typecheck) verifyCommands.push({ label: 'npm run typecheck', command: 'npm', args: ['run', 'typecheck'], allowNetwork: false })
          if (scripts.build) verifyCommands.push({ label: 'npm run build', command: 'npm', args: ['run', 'build'], allowNetwork: false })

          if (verifyCommands.length === 0) {
            verifyCommands.push({ label: 'npm install', command: 'npm', args: ['install'], allowNetwork: true })
          } else {
            // Always ensure dependencies are present before independent checks.
            verifyCommands.unshift({ label: 'npm install', command: 'npm', args: ['install'], allowNetwork: true })
          }

          for (const command of verifyCommands) {
            console.log(`\n--- verify: ${command.label} ---`)
            const executor = ctx.sandbox.get('docker')!
            const execution = await executor.execute({
              command: command.command,
              args: command.args,
              cwd: WORKSPACE,
              allowNetwork: command.allowNetwork === true,
              timeoutMs: 180_000,
            })
            process.stdout.write(execution.stdout)
            process.stderr.write(execution.stderr)
            if (execution.exitCode !== 0) {
              throw new Error(`verification failed: ${command.label} exited with ${execution.exitCode}`)
            }
          }

          // Basic shape checks for the requested frontend/backend deliverable.
          const files = await execDocker(ctx, {
            command: 'sh',
            args: ['-lc', 'find . -maxdepth 3 -type f | sort'],
            cwd: WORKSPACE,
          })
          console.log('\n--- generated files ---')
          console.log(files.stdout)

          const normalized = files.stdout.toLowerCase()
          const hasFrontend = normalized.split('\n').some((line) => line.trim() === './public/index.html')
          const hasBackend = normalized.split('\n').some((line) => line.trim() === './server.ts')
          if (!hasFrontend) throw new Error('verification failed: could not identify a frontend entrypoint')
          if (!hasBackend) throw new Error('verification failed: could not identify a backend entrypoint')

          console.log('\nPASS: real OpenRouter coding-agent completed and the generated project passed independent Docker verification.')
          resolveReady()
        } catch (error) {
          rejectReady(error)
        }
      },
    })
  })
}

async function execDocker(ctx: CordisContext, request: {
  command: string
  args: string[]
  cwd: string
  allowNetwork?: boolean
}) {
  const executor = ctx.sandbox.get('docker')
  if (!executor) throw new Error('Docker executor is not registered')
  return executor.execute({ ...request, timeoutMs: 60_000 })
}

run().catch((error) => {
  console.error('\nFAIL:', error instanceof Error ? error.message : String(error))
  console.error(`workspace preserved at: ${WORKSPACE}`)
  process.exitCode = 1
})
