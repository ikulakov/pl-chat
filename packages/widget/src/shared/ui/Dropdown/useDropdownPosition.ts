import { type RefObject, useLayoutEffect, useState } from 'react'
import { computeDropdownPosition } from './computeDropdownPosition'

interface Params {
  isOpen: boolean
  /** Якорь из `open({ anchor })`; нет его — ставим слой относительно триггера. */
  anchorRef: RefObject<HTMLElement | null>
  triggerRef: RefObject<HTMLElement | null>
  layerRef: RefObject<HTMLElement | null>
}

/**
 * Позиция слоя с учётом краёв вьюпорта. `null` — ещё не измерен: слой рисуется скрытым, иначе
 * он мигнул бы в углу 0,0. Мерим после рендера портала — нужны реальные размеры слоя.
 */
export function useDropdownPosition({
  isOpen,
  anchorRef,
  triggerRef,
  layerRef,
}: Params): { top: number; left: number } | null {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!isOpen) return

    const anchor = anchorRef.current ?? triggerRef.current
    const layer = layerRef.current
    if (!anchor || !layer) return

    setPosition(
      computeDropdownPosition(anchor.getBoundingClientRect(), layer.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    )

    // следующее открытие снова начнётся со скрытого, неизмеренного слоя
    return () => setPosition(null)
  }, [isOpen, anchorRef, triggerRef, layerRef])

  return position
}
