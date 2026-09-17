import { VIEWPORT_MARGIN } from '../floating/viewport'

// зазор между триггером и тултипом; курсор проходит его насквозь, поэтому закрытие идёт с
// задержкой (CLOSE_DELAY_MS) — иначе тултип исчезал бы на полпути к нему
export const GAP = 6
// стрелка не должна заезжать на скругление угла
export const ARROW_INSET = 12

export type TooltipSide = 'top' | 'bottom'

export interface TooltipPlacement {
  top: number
  left: number
  side: TooltipSide
  /** смещение стрелки от левого края тултипа: она остаётся над центром триггера */
  arrowLeft: number
}

/**
 * Чистое позиционирование тултипа по rect триггера.
 *
 * От меню (`computeDropdownPosition`) отличается двумя вещами, ради которых и живёт отдельно:
 * предпочитает верх, а не низ, и центрируется по триггеру, а не по его правому краю. Свести
 * их в одну функцию можно было бы только флагами, а два коротких правила читаются лучше.
 */
export function computeTooltipPosition(
  trigger: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>,
  tooltip: Pick<DOMRect, 'width' | 'height'>,
  viewport: Pick<DOMRect, 'width' | 'height'>,
): TooltipPlacement {
  // по вертикали: по умолчанию над триггером; не влезает — под ним; не влезает и там —
  // прижимаем к нижнему краю вьюпорта
  const above = trigger.top - GAP - tooltip.height
  const fitsAbove = above >= VIEWPORT_MARGIN
  const side: TooltipSide = fitsAbove ? 'top' : 'bottom'

  let top = fitsAbove ? above : trigger.bottom + GAP
  top = Math.min(top, viewport.height - VIEWPORT_MARGIN - tooltip.height)
  top = Math.max(top, VIEWPORT_MARGIN)

  // по горизонтали: центр тултипа по центру триггера, затем clamp к краям вьюпорта
  const centerX = (trigger.left + trigger.right) / 2
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - VIEWPORT_MARGIN - tooltip.width)
  const left = Math.min(Math.max(centerX - tooltip.width / 2, VIEWPORT_MARGIN), maxLeft)

  // стрелка едет за центром триггера даже после clamp'а — иначе она указывала бы мимо
  const arrowMax = Math.max(ARROW_INSET, tooltip.width - ARROW_INSET)
  const arrowLeft = Math.min(Math.max(centerX - left, ARROW_INSET), arrowMax)

  return { top, left, side, arrowLeft }
}
