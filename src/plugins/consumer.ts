import { Context } from 'cordis'

export const name = 'consumer'
// `inject` is a hard dependency: Cordis holds this plugin PENDING until
// a `greeter` service exists, so ctx.greeter is guaranteed ready inside apply().
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
