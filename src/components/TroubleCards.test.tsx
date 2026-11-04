// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockData } from '../data/mockData'
import { messages } from '../i18n'
import { fsrsFixture } from '../test/fsrsFixture'
import { TroubleCards } from './TroubleCards'

const m = messages.activity
const show = (fsrs = fsrsFixture()) => render(<TroubleCards fsrs={fsrs} decks={mockData.decks} />)
const clipboard = (writeText: (text: string) => Promise<void>) => Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
const copy = () => act(async () => void fireEvent.click(screen.getByRole('button', { name: m.troubleCopy })))

afterEach(cleanup)

describe('TroubleCards', () => {
  it('lists the cards with their answers', () => {
    show()
    expect(screen.getByText('A synthetic card')).toBeTruthy()
    expect(screen.getByText(m.troubleCounts('Language', 3, 2, 7))).toBeTruthy()
  })

  it('copies a search Anki’s Browser understands', async () => {
    const writeText = vi.fn(async () => {})
    clipboard(writeText)
    show()
    await copy()
    expect(writeText).toHaveBeenCalledWith('cid:1700000000001,1700000000002')
    expect(screen.getByRole('button', { name: m.troubleCopied })).toBeTruthy()
  })

  it('shows the search to copy by hand if the clipboard refuses', async () => {
    clipboard(async () => Promise.reject(new Error('denied')))
    show()
    await copy()
    expect(screen.getByText('cid:1700000000001,1700000000002')).toBeTruthy()
  })

  it('says so when no card is causing trouble, and stays away with an older API', () => {
    show({ ...fsrsFixture(), troubleCards: [] })
    expect(screen.getByText(m.troubleEmpty(90))).toBeTruthy()
    cleanup()
    const { container } = show({ ...fsrsFixture(), troubleCards: undefined })
    expect(container.textContent).toBe('')
  })
})
