// CLI: npm run copy-collection            (auto-detects a single profile)
//      ANKI_PROFILE=Name npm run copy-collection

import { copyCollection, CopyError } from './collection.ts'

try {
  const { profile, bytes } = copyCollection()
  console.log(`✓ Copied profile "${profile}" (${(bytes / 1e6).toFixed(1)} MB) -> data/collection.anki2`)
} catch (err) {
  if (!(err instanceof CopyError)) throw err
  console.error(`✗ ${err.message}`)
  process.exit(1)
}
