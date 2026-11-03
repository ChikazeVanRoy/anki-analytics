// The four sections and their URL hashes (#/activity, ...). Hash routing needs no server config,
// so the same build works locally and behind any static host.

export const ROUTES = ['home', 'activity', 'planner', 'advanced'] as const
export type Route = (typeof ROUTES)[number]

/** "#/planner" -> "planner"; anything unknown -> "home". */
export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'home'
}

export const routeHref = (route: Route) => (route === 'home' ? '#/' : `#/${route}`)
