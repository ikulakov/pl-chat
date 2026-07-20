import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import type { TimelineItem } from '../domain/timeline'
import { selectIsLoadingHistory } from '../store/selectors'
import { useChatActions } from './useChatActions'
import { useChatStore } from './useChatStore'

// Метка ряда ленты — по ней ищется якорь удержания позиции (вешают MessageRow и SystemMessage).
export const ITEM_ID_ATTR = 'data-item-id'

// Допуск на дробные scrollTop/округления у краёв.
const SCROLL_EDGE_EPS_PX = 4

const LOAD_AHEAD_SCREENS = 1

const ABORT_AFTER_SCREENS = 2

interface UseLoadMoreHistoryParams {
  timeline: TimelineItem[]
  containerRef: React.RefObject<HTMLElement | null>
}

interface Anchor {
  id: string
  top: number
}

function calcPosition(list: HTMLElement): {
  isLoadZone: boolean
  isCancelZone: boolean
  isAtBottom: boolean
} {
  const first = list.querySelector<HTMLElement>(`[${ITEM_ID_ATTR}]`)
  const distanceToTop = list.scrollTop - (first?.offsetTop ?? 0)
  return {
    isAtBottom: list.scrollHeight - list.clientHeight - list.scrollTop <= SCROLL_EDGE_EPS_PX,
    isLoadZone: distanceToTop <= list.clientHeight * LOAD_AHEAD_SCREENS + SCROLL_EDGE_EPS_PX,
    isCancelZone: distanceToTop > list.clientHeight * ABORT_AFTER_SCREENS,
  }
}

// Якорь — первый ряд, пересекающий верх viewport
function pickAnchor(list: HTMLElement): Anchor | null {
  const rows = list.querySelectorAll<HTMLElement>(`[${ITEM_ID_ATTR}]`)

  for (const row of rows) {
    if (row.offsetTop + row.offsetHeight > list.scrollTop) {
      const id = row.dataset.itemId
      if (id) return { id, top: row.offsetTop }
    }
  }
  return null
}

function restorePrependedPosition(list: HTMLElement, anchor: Anchor, wasAtBottom: boolean): void {
  if (wasAtBottom) {
    list.scrollTop = list.scrollHeight - list.clientHeight
    return
  }
  const el = list.querySelector<HTMLElement>(`[${ITEM_ID_ATTR}="${CSS.escape(anchor.id)}"]`)
  if (!el) return

  list.scrollTop += el.offsetTop - anchor.top
}

/**
 * Подгрузка истории вверх: догружаем, пока сверху меньше экрана контента, и удерживаем позицию.
 * Браузерный anchoring выключен в CSS (`overflow-anchor: none`) — не поддержан в Safari.
 *
 * Вызывать СТРОГО ПОСЛЕ `useChatScroll` — оба пишут `scrollTop` одного контейнера, layout-эффекты
 * идут в порядке вызова, и коррекция позиции обязана ложиться последней.
 */
export function useLoadMoreHistory({ timeline, containerRef }: UseLoadMoreHistoryParams): {
  showHistorySpinner: boolean
} {
  const { loadMoreHistory, stopLoadingHistory } = useChatActions()
  const isLoadingHistory = useChatStore(selectIsLoadingHistory)

  const anchorRef = useRef<Anchor | null>(null)
  const firstItemIdRef = useRef<string | null>(null)

  const wasAtBottomRef = useRef(true)
  const [isLoadZone, setIsLoadZone] = useState(false)

  const handlePositionChange = useEffectEvent(() => {
    const list = containerRef.current
    if (!list) return

    const { isLoadZone, isCancelZone, isAtBottom } = calcPosition(list)
    wasAtBottomRef.current = isAtBottom
    setIsLoadZone(isLoadZone)

    if (isCancelZone) {
      // Пользователь ушёл от верха — активная retry-цепочка обрывается
      stopLoadingHistory()
      return
    }
    if (isLoadZone) {
      // Якорь вычисляется до нового prepend
      anchorRef.current = pickAnchor(list)
      void loadMoreHistory()
    }
  })

  // Deps — всё, что могло открыть место сверху без скролла пользователя:
  //  • timeline — пришла страница истории или новое сообщение;
  //  • isLoadingHistory — страница без видимых событий: prependTimeline no-op → timeline та же ссылка
  useEffect(() => {
    handlePositionChange()
  }, [timeline, isLoadingHistory])

  // Скролл пользователя.
  useEffect(() => {
    const list = containerRef.current
    if (!list) return

    const onScroll = () => handlePositionChange()
    list.addEventListener('scroll', onScroll, { passive: true })

    return () => list.removeEventListener('scroll', onScroll)
  }, [containerRef])

  useEffect(() => {
    return () => stopLoadingHistory()
  }, [stopLoadingHistory])

  // Удержание позиции после prepend-вставки.
  useLayoutEffect(() => {
    const list = containerRef.current
    if (!list) return

    const firstItemId = timeline[0]?.localId ?? null
    const isPrepended = firstItemIdRef.current !== null && firstItemId !== firstItemIdRef.current

    if (isPrepended && anchorRef.current) {
      restorePrependedPosition(list, anchorRef.current, wasAtBottomRef.current)
    }

    firstItemIdRef.current = firstItemId
    anchorRef.current = pickAnchor(list)

    // Пересчет edge триггеров после prepend
    const { isLoadZone, isAtBottom } = calcPosition(list)
    wasAtBottomRef.current = isAtBottom
    setIsLoadZone(isLoadZone)
  }, [timeline, containerRef])

  return { showHistorySpinner: isLoadingHistory && isLoadZone }
}
