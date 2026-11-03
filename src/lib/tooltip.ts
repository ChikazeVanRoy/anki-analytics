// Where a tooltip goes (pure, tested): centred above its button, or below when there's no room above,
// and always fully inside the viewport's width.

export const TIP_MARGIN = 8
const TIP_GAP = 8

type Box = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>

export function tipPosition(button: Box, tip: Box, viewportWidth: number): { left: number; top: number } {
  const centred = button.left + button.width / 2 - tip.width / 2
  const left = Math.max(TIP_MARGIN, Math.min(centred, viewportWidth - tip.width - TIP_MARGIN))
  const above = button.top - tip.height - TIP_GAP
  return { left, top: above >= TIP_MARGIN ? above : button.bottom + TIP_GAP }
}
