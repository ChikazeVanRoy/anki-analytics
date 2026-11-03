import { describe, expect, it } from 'vitest'
import { TIP_MARGIN, tipPosition } from './tooltip'

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
})
const tip = box(0, 0, 256, 120)

describe('tipPosition', () => {
  it('centres the tip above its button when there is room', () => {
    expect(tipPosition(box(500, 300, 20, 20), tip, 1000)).toEqual({ left: 382, top: 172 })
  })

  it('stays inside the left edge', () => {
    expect(tipPosition(box(90, 300, 20, 20), tip, 375).left).toBe(TIP_MARGIN)
  })

  it('stays inside the right edge', () => {
    const { left } = tipPosition(box(340, 300, 20, 20), tip, 375)
    expect(left + tip.width).toBe(375 - TIP_MARGIN)
  })

  it('flips below the button near the top of the viewport', () => {
    expect(tipPosition(box(500, 40, 20, 20), tip, 1000).top).toBe(68)
  })
})
