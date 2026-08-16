import { Context } from 'cordis'
import { ChatService } from './plugins/chat/index.ts'
import { AgentService } from './plugins/agent/index.ts'
import { ModelService } from './plugins/model/index.ts'
import { StorageService } from './plugins/storage/index.ts'
import { ChannelService } from './plugins/channel/index.ts'

const ctx = new Context()

// The five Phase 1 service boundaries. All are empty shells except
// ModelService/ChannelService's registries — see docs/adr/ADR-0001 and
// docs/adr/ADR-0002 for why the boundaries are drawn here.
ctx.plugin(ChatService)
ctx.plugin(AgentService)
ctx.plugin(ModelService)
ctx.plugin(StorageService)
ctx.plugin(ChannelService)

// inject guarantees this only runs once all five services above are mounted —
// same pattern Phase 0's consumer.ts used, now verified with Service classes too.
ctx.plugin({
  name: 'phase1-boot-check',
  inject: ['chat', 'agent', 'model', 'storage', 'channel'],
  apply(ctx: Context) {
    console.log('--- AI Hub kernel booted (Phase 1) ---')
    console.log('services online: chat, agent, model, storage, channel')
    console.log('model providers registered:', ctx.model.list())
    console.log('channel adapters registered:', ctx.channel.list())
  },
})


