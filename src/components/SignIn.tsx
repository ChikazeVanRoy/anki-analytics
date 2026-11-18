import { useState, type FormEvent } from 'react'
import { Logo } from './icons'
import type { CloudErrorKind } from '../lib/firebaseRest'
import { messages as m } from '../i18n'

/** The phone's first screen: your stats are in your own Firebase project, so it asks who you are. */
export function SignIn({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<CloudErrorKind | null> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<CloudErrorKind | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setProblem(null)
    const failed = await onSignIn(email, password)
    // On success the app moves on and this screen goes away
    if (failed) {
      setProblem(failed)
      setBusy(false)
    }
  }

  // 16px text: iOS zooms into smaller fields when they're tapped
  const field = 'mt-1 block h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base text-ink placeholder:text-muted focus:border-brand focus:outline-none'

  return (
    <div className="min-h-screen">
      <div className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2.5 px-4 sm:px-6">
          <Logo />
          <span className="text-lg font-black tracking-tight text-ink">{m.appName}</span>
        </div>
      </div>
      <main className="mx-auto max-w-md px-4 py-8 sm:px-6">
        <form onSubmit={submit} className="rounded-3xl bg-surface p-6 shadow-card">
          <h1 className="text-xl font-black tracking-tight text-ink">{m.cloud.signInTitle}</h1>
          <p className="mt-2 text-sm text-ink-2">{m.cloud.signInBody}</p>

          <label className="mt-5 block text-sm font-bold text-ink-2">
            {m.cloud.email}
            <input type="email" name="email" autoComplete="username" inputMode="email" autoCapitalize="none" autoCorrect="off" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </label>
          <label className="mt-4 block text-sm font-bold text-ink-2">
            {m.cloud.password}
            <input type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          </label>

          {problem && (
            <p role="alert" className="mt-4 rounded-2xl border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-ink">
              {m.cloud.errors[problem]}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-brand px-4 text-base font-bold text-brand-ink transition-all active:scale-95 disabled:opacity-60"
          >
            {busy ? m.cloud.signingIn : m.cloud.signIn}
          </button>
        </form>
      </main>
    </div>
  )
}
