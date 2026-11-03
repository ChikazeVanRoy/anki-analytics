import { describe, expect, it } from 'vitest'
import { parseRoute, routeHref } from './route'

describe('parseRoute', () => {
  it('maps hashes to sections', () => {
    expect(parseRoute('#/activity')).toBe('activity')
    expect(parseRoute('#planner')).toBe('planner')
    expect(parseRoute('#/advanced/anything?x=1')).toBe('advanced')
  })
  it('falls back to home', () => {
    expect(parseRoute('')).toBe('home')
    expect(parseRoute('#/')).toBe('home')
    expect(parseRoute('#/nope')).toBe('home')
  })
  it('round-trips with routeHref', () => {
    for (const r of ['home', 'activity', 'planner', 'advanced'] as const) expect(parseRoute(routeHref(r))).toBe(r)
  })
})
