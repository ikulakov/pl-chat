import type { Dimensions, Position, TriggerRect } from './types'

// отступ меню от триггера и минимальный зазор до края вьюпорта (iframe чата маленький)
export const GAP = 4
export const VIEWPORT_MARGIN = 8

// Чистое позиционирование меню по rect триггера с коллизией к краям вьюпорта.
export function computeDropdownPosition(
  trigger: TriggerRect,
  menu: Dimensions,
  viewport: Dimensions,
): Position {
  // по вертикали: по умолчанию под триггером; если не влезает — над ним;
  // если и там тесно — прижимаем к нижнему краю с отступом
  let top = trigger.bottom + GAP
  if (top + menu.height > viewport.height - VIEWPORT_MARGIN) {
    const above = trigger.top - GAP - menu.height
    top = above >= VIEWPORT_MARGIN ? above : viewport.height - VIEWPORT_MARGIN - menu.height
  }

  // по горизонтали: по умолчанию правый край меню = правый край триггера;
  // если уезжает за левый край — выравниваем по левому краю триггера;
  // финальный clamp держит меню в пределах вьюпорта с обеих сторон
  let left = trigger.right - menu.width
  if (left < VIEWPORT_MARGIN) left = trigger.left
  left = Math.min(left, viewport.width - VIEWPORT_MARGIN - menu.width)
  left = Math.max(left, VIEWPORT_MARGIN)

  return { top: Math.max(top, VIEWPORT_MARGIN), left }
}
