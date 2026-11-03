// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { InfoTip } from './ui'

afterEach(cleanup)

const tip = () => screen.getByRole('tooltip', { hidden: true })

describe('InfoTip', () => {
  // jsdom has no Tailwind, so visibility is read from the classes the component sets
  const isShown = () => tip().className.split(' ').includes('block')

  it('is hidden until hovered or focused', () => {
    render(<InfoTip>Explanation</InfoTip>)
    expect(isShown()).toBe(false)
    fireEvent.mouseEnter(screen.getByRole('button'))
    expect(isShown()).toBe(true)
    fireEvent.mouseLeave(screen.getByRole('button'))
    expect(isShown()).toBe(false)
    fireEvent.focus(screen.getByRole('button'))
    expect(isShown()).toBe(true)
  })

  it('hides on Escape even when it was opened by hover and focus is elsewhere', () => {
    render(<InfoTip>Explanation</InfoTip>)
    fireEvent.mouseEnter(screen.getByRole('button'))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(isShown()).toBe(false)
  })

  it('shows again after the pointer leaves and returns', () => {
    render(<InfoTip>Explanation</InfoTip>)
    const button = screen.getByRole('button')
    fireEvent.mouseEnter(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseLeave(button)
    fireEvent.mouseEnter(button)
    expect(isShown()).toBe(true)
  })
})
