import { describe, expect, it } from 'vitest'
import { buildPlist, plistPath, SERVICE_LABEL } from './backgroundService.ts'

describe('plistPath', () => {
  it('lives in the user LaunchAgents folder', () => {
    expect(plistPath('/Users/x')).toBe(`/Users/x/Library/LaunchAgents/${SERVICE_LABEL}.plist`)
  })
})

describe('buildPlist', () => {
  const plist = buildPlist({ nodePath: '/n/bin/node', repoDir: '/Users/x/anki', port: 5174 })

  it('runs the API with the absolute node path from the checkout, at login, and restarts it', () => {
    expect(plist).toContain('<string>/n/bin/node</string>')
    expect(plist).toContain('<string>server/index.ts</string>')
    expect(plist).toContain('<key>WorkingDirectory</key><string>/Users/x/anki</string>')
    expect(plist).toContain('<key>RunAtLoad</key><true/>')
    expect(plist).toContain('<key>KeepAlive</key><true/>')
    expect(plist).toContain('<key>ANKI_ANALYTICS_PORT</key><string>5174</string>')
    expect(plist).toContain('/Users/x/anki/data/server.log')
  })

  it('escapes XML characters in paths', () => {
    expect(buildPlist({ nodePath: '/a&b/node', repoDir: '/x', port: 1 })).toContain('/a&amp;b/node')
  })
})
