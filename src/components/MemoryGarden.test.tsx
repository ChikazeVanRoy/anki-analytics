// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Deck } from '../data/types'
import type { GardenBed, Plant } from '../lib/garden'
import { GardenPlot } from './MemoryGarden'

const plant = (stage: Plant['stage']) => ({ stage, lift: 0, tilt: 0, scale: 1 }) as Plant
const bed = { plants: [plant('sprout'), plant('flower')], counts: { flower: 1, bud: 0, sprout: 1, wilt: 0, seed: 0 }, unit: 1 } as GardenBed
const deck = (name: string) => ({ id: name, name }) as Deck

function garden() {
  const { container } = render(
    <>
      <GardenPlot deck={deck('One')} bed={bed} color="red" />
      <GardenPlot deck={deck('Two')} bed={bed} color="blue" />
      <p>Elsewhere</p>
    </>,
  )
  const plants = [...container.querySelectorAll('[data-plant]')]
  const pick = (el: Element) => {
    fireEvent.pointerUp(el)
    fireEvent.click(el)
  }
  const shown = () => [...container.querySelectorAll('p[aria-live]')].map((p) => p.textContent)
  return { plants, pick, shown }
}

const HINT = 'Tap a plant to see its card.'

describe('GardenPlot', () => {
  afterEach(cleanup)

  it('lets go of the plant when you tap outside the plants', () => {
    const { plants, pick, shown } = garden()
    pick(plants[1])
    expect(shown()).toEqual(['Long interval', HINT])
    fireEvent.pointerUp(screen.getByText('Elsewhere'))
    expect(shown()).toEqual([HINT, HINT])
  })

  it('lets go when you tap the bed between its plants', () => {
    const { plants, pick, shown } = garden()
    pick(plants[1])
    fireEvent.pointerUp(plants[1].parentElement as Element)
    expect(shown()[0]).toBe(HINT)
  })

  it('keeps the plant while you start a scroll', () => {
    const { plants, pick, shown } = garden()
    pick(plants[1])
    const elsewhere = screen.getByText('Elsewhere')
    fireEvent.pointerDown(elsewhere)
    fireEvent.pointerCancel(elsewhere)
    expect(shown()[0]).toBe('Long interval')
  })

  it('keeps the plant while you select its text to copy', () => {
    const { plants, pick, shown } = garden()
    pick(plants[1])
    const line = screen.getByText('Long interval')
    window.getSelection()?.selectAllChildren(line)
    fireEvent.pointerUp(line)
    expect(shown()[0]).toBe('Long interval')
    window.getSelection()?.removeAllRanges()
  })

  it('lets go when you tab away from the bed', () => {
    const { plants, pick, shown } = garden()
    pick(plants[1])
    fireEvent.keyDown(screen.getByRole('group', { name: /^One: / }), { key: 'Tab' })
    expect(shown()[0]).toBe(HINT)
  })

  it('moves between plants of a bed without letting go', () => {
    const { plants, pick, shown } = garden()
    pick(plants[0])
    pick(plants[1])
    expect(shown()[0]).toBe('Long interval')
  })

  it('keeps one plant picked across beds', () => {
    const { plants, pick, shown } = garden()
    pick(plants[0])
    pick(plants[3])
    expect(shown()).toEqual([HINT, 'Long interval'])
  })
})
