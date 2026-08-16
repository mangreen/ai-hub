import { Context } from 'cordis'
import { GreeterService } from './plugins/greeter.ts'
import * as consumer from './plugins/consumer.ts'
import * as eventDemo from './plugins/event-demo.ts'

const ctx = new Context()

// A Service subclass is itself a plugin — ctx.plugin() mounts it.
ctx.plugin(GreeterService)

// Function-form plugins are mounted the same way.
ctx.plugin(consumer)
ctx.plugin(eventDemo)

console.log('--- AI Hub kernel booted (Phase 0) ---')
