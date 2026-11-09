// A macOS LaunchAgent that keeps the local API running in the background, so no Terminal window has to stay open.
// The pure parts (plist text, paths) are here so they can be tested; server/background-service.ts does the launchctl work.

import { homedir } from 'node:os'
import { join } from 'node:path'

export const SERVICE_LABEL = 'local.anki-analytics'

export function plistPath(home = homedir()): string {
  return join(home, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`)
}

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface ServiceOptions {
  /** Absolute path to the node binary: launchd doesn't load your shell profile, so nvm's node isn't on PATH */
  nodePath: string
  /** The checkout, used as the working directory so relative paths (data/, dist/) resolve */
  repoDir: string
  port: number
}

/** The LaunchAgent definition: starts at login, restarts if it dies, at most once every 10 s (e.g. port in use). */
export function buildPlist({ nodePath, repoDir, port }: ServiceOptions): string {
  const log = escapeXml(join(repoDir, 'data', 'server.log'))
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>server/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>${escapeXml(repoDir)}</string>
  <key>EnvironmentVariables</key>
  <dict><key>ANKI_ANALYTICS_PORT</key><string>${port}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
</dict>
</plist>
`
}
