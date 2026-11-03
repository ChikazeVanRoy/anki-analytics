// Lets Node run browser-side modules (src/lib imports have no ".ts" extension) for compare.ts.
// Used as: node --import ./scripts/fsrs-validation/ts-resolve.ts scripts/fsrs-validation/compare.ts
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  },
})
