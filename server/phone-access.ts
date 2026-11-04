// CLI: npm run phone-access -- your-mac.your-tailnet.ts.net    Lets your phone reach the app through Tailscale
//      npm run phone-access -- off                             Stops that

import { isTailscaleName, removePhoneHost, savePhoneHost } from './phoneAccess.ts'

const name = process.argv[2]?.toLowerCase()

if (name === 'off') {
  removePhoneHost()
  console.log('✓ Your phone can no longer reach the app.')
} else if (name && isTailscaleName(name)) {
  savePhoneHost(name)
  console.log(`✓ Allowed ${name}. Now run: tailscale serve --bg 5174`)
  console.log(`  Then open https://${name} in Safari on your phone. Never use tailscale funnel: that's the public internet.`)
} else {
  console.error('Usage: npm run phone-access -- <machine>.<tailnet>.ts.net | off')
  process.exit(1)
}
