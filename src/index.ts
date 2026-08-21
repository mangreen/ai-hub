/**
 * Kernel entrypoint. Builds the root Cordis Context and mounts the five
 * service boundaries decided in Phase 1 (docs/adr/ADR-0001, ADR-0002), the
 * seven Phase 3 model provider plugins (docs/adr/ADR-0003), Phase 4's
 * SQLite persistence (docs/adr/ADR-0004), and Phase 5's orchestrator/sandbox
 * registries (docs/adr/ADR-0005, ADR-0006, ADR-0007). Since Phase 4,
 * ChatService and AgentService both `static inject = ['storage']` — see
 * docs/architecture/cordis-dependency-graph.md for the current graph.
 */
import { Context } from 'cordis'
import { ChatService } from './plugins/chat/index.ts'
import { AgentService } from './plugins/agent/index.ts'
import { ModelService } from './plugins/model/index.ts'
import { StorageService } from './plugins/storage/index.ts'
import { ChannelService } from './plugins/channel/index.ts'
import { OrchestratorService } from './plugins/orchestrator/index.ts'
import { SandboxService } from './plugins/sandbox/index.ts'
import * as ollamaProvider from './plugins/model/ollama/index.ts'
import * as openaiProvider from './plugins/model/openai/index.ts'
import * as geminiProvider from './plugins/model/gemini/index.ts'
import * as grokProvider from './plugins/model/grok/index.ts'
import * as nvidiaNimProvider from './plugins/model/nvidia-nim/index.ts'
import * as openrouterProvider from './plugins/model/openrouter/index.ts'
import * as claudeProvider from './plugins/model/claude/index.ts'
import * as taskGraphStrategy from './plugins/orchestrator/task-graph/index.ts'

const ctx = new Context()

ctx.plugin(ChatService)
ctx.plugin(AgentService)
ctx.plugin(ModelService)
ctx.plugin(StorageService)
ctx.plugin(ChannelService)
ctx.plugin(OrchestratorService)
ctx.plugin(SandboxService)

// All seven register regardless of whether their API key env var is set —
// registration never makes a network call, only .complete() does. An
// unconfigured provider fails loudly and clearly on first real use instead
// of silently vanishing from ctx.model.list().
ctx.plugin(ollamaProvider)
ctx.plugin(openaiProvider)
ctx.plugin(geminiProvider)
ctx.plugin(grokProvider)
ctx.plugin(nvidiaNimProvider)
ctx.plugin(openrouterProvider)
ctx.plugin(claudeProvider)

// The default (and only, as of Phase 5) orchestration strategy — see
// docs/adr/ADR-0007 for why it's hand-written rather than an external
// framework, and src/plugins/orchestrator/task-graph/index.ts for the
// execution logic itself.
ctx.plugin(taskGraphStrategy)

// `inject` guarantees this only runs once all seven services above are
// mounted. The original worked example of this pattern (a Phase 0 demo
// plugin) was intentionally deleted once it had served its purpose — see
// git branch phase/0-environment-cordis-basics to view it.
ctx.plugin({
  name: 'kernel-boot-check',
  inject: ['chat', 'agent', 'model', 'storage', 'channel', 'orchestrator', 'sandbox'],
  apply(ctx: Context) {
    console.log('--- AI Hub kernel booted ---')
    console.log('services online: chat, agent, model, storage, channel, orchestrator, sandbox')
    console.log('model providers registered:', ctx.model.list())
    console.log('channel adapters registered:', ctx.channel.list())
    console.log('orchestration strategies registered:', ctx.orchestrator.list())
    console.log('sandbox executors registered:', ctx.sandbox.list())
  },
})

