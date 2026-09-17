import { resolveRoot } from '../../utils/resolveRoot'

/**
 * Куда порталить плавающий слой: в сам ShadowRoot в shadow-embed, иначе в body.
 *
 * Знание про порталы слоёв живёт здесь, а не в `shared/utils`: там `resolveRoot` — общая
 * утилита про Shadow DOM, её зовёт и клавиатурная навигация меню (`activeElement`).
 */
export function resolvePortalContainer(node: Node | null): ShadowRoot | HTMLElement {
  const root = resolveRoot(node)
  return root instanceof ShadowRoot ? root : root.body
}
