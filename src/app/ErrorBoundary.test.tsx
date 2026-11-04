// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { messages } from '../i18n'
import { ErrorBoundary } from './ErrorBoundary'

function Broken(): never {
  throw new Error('Failed to fetch dynamically imported module')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ErrorBoundary', () => {
  it('says what went wrong, and retrying reloads the page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}) // React reports the caught error too
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Failed to fetch dynamically imported module')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: messages.error.retry }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
