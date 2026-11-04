// The sections and their URL hashes (#/activity, ...). Hash routing needs no server config,
// so the same build works locally and behind any static host.

export const NAV_ROUTES = ['home', 'activity', 'planner', 'advanced'] as const
/** Wrapped is reached from links, so it's a page without a place in the navigation. */
export const ROUTES = [...NAV_ROUTES, 'wrapped'] as const
export type Route = (typeof ROUTES)[number]

/** "#/planner" -> "planner"; anything unknown -> "home". */
export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'home'
}

export const routeHref = (route: Route) => (route === 'home' ? '#/' : `#/${route}`)
