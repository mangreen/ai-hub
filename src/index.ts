/**
 * Kernel entrypoint. Builds the root Cordis Context and mounts the five
 * service boundaries decided in Phase 1 (docs/adr/ADR-0001, ADR-0002).
 * None of the five services `inject` each other yet — see
 * docs/architecture/cordis-dependency-graph.md for why that's intentional,
 * not an oversight.
 */
import { Context } from 'cordis'
import { ChatService } from './plugins/chat/index.ts'
import { AgentService } from './plugins/agent/index.ts'
import { ModelService } from './plugins/model/index.ts'
import { StorageService } from './plugins/storage/index.ts'
import { ChannelService } from './plugins/channel/index.ts'

const ctx = new Context()

ctx.plugin(ChatService)
ctx.plugin(AgentService)
ctx.plugin(ModelService)
ctx.plugin(StorageService)
ctx.plugin(ChannelService)

// `inject` guarantees this only runs once all five services above are
// mounted. The original worked example of this pattern (a Phase 0 demo
// plugin) was intentionally deleted once it had served its purpose — see
// git branch phase/0-environment-cordis-basics to view it.
ctx.plugin({
  name: 'kernel-boot-check',
  inject: ['chat', 'agent', 'model', 'storage', 'channel'],
  apply(ctx: Context) {
    console.log('--- AI Hub kernel booted ---')
    console.log('services online: chat, agent, model, storage, channel')
    console.log('model providers registered:', ctx.model.list())
    console.log('channel adapters registered:', ctx.channel.list())
  },
})


