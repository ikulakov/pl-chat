import { type RefObject, useEffect, useEffectEvent } from 'react'

export type DismissReason = 'outside' | 'escape' | 'scroll'

/**
 * Закрытие открытого слоя извне: нажатие вне `insideRefs`, Escape, прокрутка любого контейнера.
 *
 * Внешнее нажатие ловим на `pointerdown`, а не на `click`: к моменту click фокус уже уехал на цель,
 * и закрытие опоздало бы. Поэтому всё, чей собственный click должен долететь (триггер, сам слой),
 * передаётся в `insideRefs`.
 */
export function useDismiss(
  isOpen: boolean,
  insideRefs: RefObject<HTMLElement | null>[],
  onDismiss: (reason: DismissReason) => void,
): void {
  // По пути события, а не по target: из Shadow DOM событие доходит до document с target,
  // подменённым на хост, и `contains(target)` считал бы внешним любое нажатие внутри слоя.
  const isInside = useEffectEvent((event: Event) => {
    const path = event.composedPath()
    return insideRefs.some((ref) => ref.current !== null && path.includes(ref.current))
  })
  const dismiss = useEffectEvent((reason: DismissReason) => onDismiss(reason))

  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event)) dismiss('outside')
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss('escape')
    }
    // Фаза захвата обязательна: скроллится лента сообщений, а не window, и всплытия оттуда нет.
    const onScroll = () => dismiss('scroll')

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [isOpen])
}
