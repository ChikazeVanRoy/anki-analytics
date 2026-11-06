import { useVersion } from '../data/useVersion'
import { messages as m } from '../i18n'

/** The footer's version and update button. Absent when there's no API to ask, as on your phone. */
export function VersionLine() {
  const { version, checking, outcome, checkForUpdate } = useVersion()
  if (!version) return null
  const note = outcome?.kind === 'current' ? m.data.appUpToDate : outcome?.kind === 'updated' ? m.data.appUpdated(outcome.commits) : outcome?.kind === 'problem' ? m.data.appUpdateProblem(outcome.message) : version.restartNeeded ? m.data.restartNeeded : null
  return (
    <p className="mt-2">
      {m.data.version(version.commit, version.date)}
      {' · '}
      <button type="button" onClick={checkForUpdate} disabled={checking} className="rounded font-semibold underline underline-offset-2 hover:text-ink disabled:opacity-60">
        {checking ? m.data.checkingForUpdates : m.data.checkForUpdates}
      </button>
      {note && (
        <span role="status" className="mt-1 block">
          {note}
        </span>
      )}
    </p>
  )
}
