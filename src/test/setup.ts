// Runs before every test file. Testing Library's findBy… and waitFor give up after 1 s by default, which a busy Mac
// (other work, several test files at once) can exceed, so a passing test would fail. They return as soon as the
// thing they wait for appears, so a longer limit only costs time when a test really fails.
// Only where there's a page to test: the server's tests run without one, and needn't load React DOM.
if (typeof document !== 'undefined') {
  const { configure } = await import('@testing-library/react')
  configure({ asyncUtilTimeout: 10_000 })
}
