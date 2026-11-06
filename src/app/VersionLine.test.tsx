// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { messages } from '../i18n'
import { VersionLine } from './VersionLine'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('VersionLine', () => {
  it('shows the version and gets updates from the button', async () => {
    let version = { commit: 'abc1234', date: '2026-11-06', restartNeeded: false }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/version') return json(version)
      if (url === '/api/update' && init?.method === 'POST') {
        version = { ...version, restartNeeded: true }
        return json({ outcome: 'updated', commits: 2 })
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<VersionLine />)
    expect(await screen.findByText(new RegExp('abc1234'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: messages.data.checkForUpdates }))
    expect((await screen.findByRole('status')).textContent).toBe(messages.data.appUpdated(2))
    const post = fetchMock.mock.calls.find(([u]) => u === '/api/update')![1]!
    expect((post.headers as Record<string, string>)['X-Requested-By']).toBe('anki-analytics')
  })

  it('says when it is up to date and when it could not update', async () => {
    let answer: unknown = { outcome: 'current' }
    vi.stubGlobal('fetch', async (url: string) => (url === '/api/version' ? json({ commit: 'abc1234', date: null }) : json(answer)))
    render(<VersionLine />)
    const button = await screen.findByRole('button', { name: messages.data.checkForUpdates })
    fireEvent.click(button)
    expect((await screen.findByRole('status')).textContent).toBe(messages.data.appUpToDate)
    answer = { outcome: 'offline', message: 'Couldn’t reach GitHub.' }
    fireEvent.click(button)
    expect((await screen.findByText(messages.data.appUpdateProblem('Couldn’t reach GitHub.')))).toBeTruthy()
  })

  it('shows nothing when there is no API to ask, as on your phone', async () => {
    vi.stubGlobal('fetch', async () => json({ error: 'Not found' }, 404))
    const { container } = render(<VersionLine />)
    await new Promise((r) => setTimeout(r, 20))
    expect(container.textContent).toBe('')
  })
})
