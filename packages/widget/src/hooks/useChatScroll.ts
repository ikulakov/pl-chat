import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isSystem, type TimelineItem } from '../domain/timeline'
import { useIntersectionObserver } from './useIntersectionObserver'
import { ITEM_ID_ATTR } from './useLoadMoreHistory'

const NEAR_BOTTOM_PX = 80

const SMOOTH_TAIL_PX = 150

interface UseChatScrollParams {
  timeline: TimelineItem[]
  userId: string
  containerRef: React.RefObject<HTMLElement | null>
  bottomRef: React.RefObject<Element | null>
}

/**
 * Управляет скролл-логикой чата:
 * - Автоскролл при новых сообщениях
 *  - Прилипание к низу при изменении размера контейнера
 * - `isNearBottom` (с допуском NEAR_BOTTOM_PX)
 * - `scrollToBottom` для кнопки «вниз»
 * - CSS-переменная --scrollbar-w (ширина скроллбара)
 */
export function useChatScroll({ containerRef, bottomRef, timeline, userId }: UseChatScrollParams): {
  isNearBottom: boolean
  scrollToBottom: () => void
  scrollToItem: (localId: string) => HTMLElement | null
} {
  // Ref источник истины, state намеренно отстаёт: пока идёт плавный автоскролл он заморожен
  const [isNearBottom, setIsNearBottom] = useState(true)
  const isNearBottomRef = useRef(true)

  const isAutoScrollingRef = useRef(false)
  const lastMessageIdRef = useRef<string | null>(null)

  const scrollList = useCallback(
    (behavior: ScrollBehavior) => {
      const list = containerRef.current
      if (!list) return

      list.scrollTo({ top: list.scrollHeight, behavior })
    },
    [containerRef],
  )

  // Основная логика скролла при новых сообщениях
  useLayoutEffect(() => {
    const list = containerRef.current
    const lastMessage = timeline.at(-1)
    if (!list || !lastMessage || lastMessage.localId === lastMessageIdRef.current) return

    const isFirstRender = lastMessageIdRef.current === null
    lastMessageIdRef.current = lastMessage.localId

    const isOwnMessage = !isSystem(lastMessage) && lastMessage.sender === userId
    if (!isOwnMessage && !isNearBottomRef.current) return

    const behavior = !isFirstRender && isNearBottomRef.current ? 'smooth' : 'auto'
    if (behavior === 'smooth') {
      isAutoScrollingRef.current = true
    }
    scrollList(behavior)
  }, [timeline, userId, containerRef, scrollList])

  useIntersectionObserver({
    root: containerRef,
    rootMargin: `0px 0px ${NEAR_BOTTOM_PX}px 0px`,
    triggerRef: bottomRef,
    callback: ({ isIntersecting }) => {
      isNearBottomRef.current = isIntersecting
      if (!isAutoScrollingRef.current) {
        setIsNearBottom(isIntersecting)
      }
    },
  })

  // снятие флага авто-скролла — по остановке скролла
  useEffect(() => {
    const list = containerRef.current
    if (!list) return

    const handleScrollEnd = () => {
      isAutoScrollingRef.current = false
      setIsNearBottom(isNearBottomRef.current)
    }
    list.addEventListener('scrollend', handleScrollEnd)
    return () => list.removeEventListener('scrollend', handleScrollEnd)
  }, [containerRef])

  //  stick-to-bottom при изменении высоты контейнера + вычисление css переменной --scrollbar-w
  useLayoutEffect(() => {
    const list = containerRef.current
    if (!list) return

    const updateScrollbarWidth = () => {
      list.style.setProperty('--scrollbar-w', `${list.offsetWidth - list.clientWidth}px`)
    }
    updateScrollbarWidth()

    const observer = new ResizeObserver(() => {
      updateScrollbarWidth()
      if (isNearBottomRef.current) {
        scrollList('auto')
      }
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [containerRef, scrollList])

  // Плавный скролл к позиции: длинную дистанцию проскакиваем мгновенно
  const smoothScrollTo = useCallback(
    (targetTop: number) => {
      const list = containerRef.current
      if (!list) return

      const maxTop = list.scrollHeight - list.clientHeight
      const clamped = Math.max(0, Math.min(targetTop, maxTop))
      const distance = clamped - list.scrollTop
      if (Math.abs(distance) > SMOOTH_TAIL_PX) {
        list.scrollTop = clamped - Math.sign(distance) * SMOOTH_TAIL_PX
      }
      list.scrollTo({ top: clamped, behavior: 'smooth' })
    },
    [containerRef],
  )

  const scrollToBottom = useCallback(() => {
    const list = containerRef.current
    if (!list) return

    smoothScrollTo(list.scrollHeight - list.clientHeight)
  }, [containerRef, smoothScrollTo])

  // Скролл к сообщению по localId с центрированием в видимой области; возвращает строку для подсветки
  const scrollToItem = useCallback(
    (localId: string): HTMLElement | null => {
      const list = containerRef.current
      if (!list) return null

      const row = list.querySelector<HTMLElement>(`[${ITEM_ID_ATTR}="${CSS.escape(localId)}"]`)
      if (!row) return null

      const offset =
        row.getBoundingClientRect().top -
        list.getBoundingClientRect().top -
        (list.clientHeight - row.offsetHeight) / 2

      smoothScrollTo(list.scrollTop + offset)
      return row
    },
    [containerRef, smoothScrollTo],
  )

  return { isNearBottom, scrollToBottom, scrollToItem }
}
