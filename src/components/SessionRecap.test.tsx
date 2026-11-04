// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { mockData } from '../data/mockData'
import type { AnkiData } from '../data/types'
import { useSessionRecap } from '../data/useSessionRecap'
import { messages } from '../i18n'
import { toDateKey } from '../lib/stats'
import { SessionRecap } from './SessionRecap'

const m = messages.recap
const recap = { reviews: 84, minutes: 20, newCards: 12, bloomed: 3, streak: 4, badges: ['week' as const], allDone: false }

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('SessionRecap', () => {
  it('celebrates what changed, and closes with the button or Escape', () => {
    const onClose = vi.fn()
    render(<SessionRecap recap={recap} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: m.title })).toBeTruthy()
    expect(screen.getByText(m.bloomed(3))).toBeTruthy()
    expect(screen.getByText(messages.home.badges.items.week.title)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: m.close }))
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    fireEvent.click(screen.getByRole('button', { name: m.close }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('makes more of a finished day', () => {
    const { container } = render(<SessionRecap recap={{ ...recap, allDone: true }} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: m.allDone.title })).toBeTruthy()
    expect(screen.getByText(m.allDone.sub)).toBeTruthy()
    expect(screen.getByRole('button', { name: m.allDone.close })).toBeTruthy()
    expect(container.querySelector('.animate-hop')).toBeTruthy()
    expect(container.querySelectorAll('.confetti').length).toBeGreaterThan(28)
  })

  it('keeps the usual recap for a day with more to do', () => {
    const { container } = render(<SessionRecap recap={recap} onClose={() => {}} />)
    expect(container.querySelector('.animate-hop')).toBeNull()
    expect(container.querySelectorAll('.confetti').length).toBe(28)
  })

  it('keeps sound off until you turn it on', () => {
    render(<SessionRecap recap={recap} onClose={() => {}} />)
    const box = screen.getByRole('checkbox', { name: m.sound }) as HTMLInputElement
    expect(box.checked).toBe(false)
    fireEvent.click(box)
    expect(localStorage.getItem('anki-analytics:sound')).toBe('on')
  })
})

describe('useSessionRecap', () => {
  const day = (reviews: number) => ({ ...mockData.daily[0], date: toDateKey(new Date()), reviews })
  const data = (reviews: number): AnkiData => ({ ...mockData, source: 'anki', dayStartHour: 0, daily: [day(reviews)] })

  it('stays quiet on a first visit, then celebrates new reviews once', () => {
    const hook = renderHook(({ d }) => useSessionRecap(d), { initialProps: { d: data(10) } })
    expect(hook.result.current.recap).toBeNull()
    hook.rerender({ d: data(25) })
    expect(hook.result.current.recap?.reviews).toBe(15)
    act(() => hook.result.current.dismissRecap())
    expect(hook.result.current.recap).toBeNull()
    hook.rerender({ d: data(26) })
    expect(hook.result.current.recap?.reviews).toBe(1)
  })

  it('keeps an unread recap across a reload', () => {
    localStorage.setItem('anki-analytics:last-visit', JSON.stringify({ reviews: 1, seconds: 0, started: 0, proven: 0, streak: 0, badges: [], day: '2020-01-01', before: 0 }))
    expect(renderHook(() => useSessionRecap(data(5))).result.current.recap?.reviews).toBe(4)
  })

  it('does nothing for sample data, and ignores a damaged record', () => {
    localStorage.setItem('anki-analytics:last-visit', '{oops')
    expect(renderHook(() => useSessionRecap(null)).result.current.recap).toBeNull()
    expect(renderHook(() => useSessionRecap(data(5))).result.current.recap).toBeNull()
  })
})
