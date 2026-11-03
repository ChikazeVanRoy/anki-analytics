import { describe, expect, it } from 'vitest'
import { formatRate } from './format'

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
