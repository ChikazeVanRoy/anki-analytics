import { describe, expect, it } from 'vitest'
import { changeDelta, formatRate } from './format'

describe('changeDelta', () => {
  const options = { tolerance: 0.005, same: 'same', text: (size: number, up: boolean) => `${up ? 'up' : 'down'} ${size}` }

  it('reports the size and direction of a real change', () => {
    expect(changeDelta(0.2, options)).toEqual({ text: 'up 0.2', good: true })
    expect(changeDelta(-0.2, options)).toEqual({ text: 'down 0.2', good: false })
  })
  it('treats a rise as bad when lower is better', () => {
    expect(changeDelta(0.2, { ...options, lowerIsBetter: true }).good).toBe(false)
  })
  it('never marks a change too small to show as worse', () => {
    expect(changeDelta(-0.001, options)).toEqual({ text: 'same', good: true })
    expect(changeDelta(0.001, { ...options, lowerIsBetter: true })).toEqual({ text: 'same', good: true })
  })
})

describe('formatRate', () => {
  it('shows one decimal, and whole numbers only for exactly 0 and 100%', () => {
    expect(formatRate(0.873)).toBe('87.3%')
    expect(formatRate(1)).toBe('100%')
    expect(formatRate(0)).toBe('0%')
  })
  it('keeps a decimal instead of rounding to 100% or 0%', () => {
    expect(formatRate(0.9987)).toBe('99.9%')
    expect(formatRate(0.003)).toBe('0.3%')
  })
  it('never reads as perfect or as zero, even when one decimal would round there', () => {
    expect(formatRate(0.9996)).toBe('99.9%')
    expect(formatRate(0.0004)).toBe('0.1%')
  })
})
