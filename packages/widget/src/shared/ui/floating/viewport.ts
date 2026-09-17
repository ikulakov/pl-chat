// минимальный зазор плавающего слоя до края вьюпорта (iframe чата маленький)
export const VIEWPORT_MARGIN = 8

/**
 * Размер вьюпорта для коллизии плавающих слоёв. clientWidth документа, а не innerWidth окна:
 * второй считает вместе с полосой прокрутки, и у правого края слой вылезал бы под неё.
 */
export function readViewport(): { width: number; height: number } {
  const root = document.documentElement
  return { width: root.clientWidth, height: root.clientHeight }
}
