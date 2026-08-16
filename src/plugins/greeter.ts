import { Context, Service } from 'cordis'

// Declaration merging: this is what makes `ctx.greeter` type-check
// everywhere else in the app, without anyone importing GreeterService directly.
declare module 'cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    // The string 'greeter' is the service name other plugins will `inject`.
    super(ctx, 'greeter')
  }

  greet(who: string) {
    return `Hello, ${who}! (from GreeterService)`
  }
}
