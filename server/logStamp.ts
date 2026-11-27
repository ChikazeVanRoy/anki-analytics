// Puts the time in front of every line the server logs (data/server.log, under the background service), so a slow read
// or a failed upload can be matched to when it happened.

type Write = (...args: unknown[]) => void

/** A console method that prefixes the local time, as 2026-11-27 14:10:09. */
export function stamped(write: Write, now = () => new Date()): Write {
  return (...args) => {
    const t = now()
    const pad = (n: number) => String(n).padStart(2, '0')
    write(`${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`, ...args)
  }
}

/** Stamps this process's console.log, console.warn and console.error. Called once, where the server starts. */
export function stampConsole() {
  console.log = stamped(console.log.bind(console))
  console.warn = stamped(console.warn.bind(console))
  console.error = stamped(console.error.bind(console))
}
