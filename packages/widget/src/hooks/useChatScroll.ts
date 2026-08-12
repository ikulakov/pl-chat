import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isSystem, type TimelineItem } from '../domain/timeline'
import { useIntersectionObserver } from './useIntersectionObserver'
import { ITEM_ID_ATTR } from './useLoadMoreHistory'

const NEAR_BOTTOM_PX = 80
const SMOOTH_TAIL_PX = 200

type ScrollTarget = 'bottom' | { element: HTMLElement; block: 'center' }

interface UseChatScrollParams {
  timeline: TimelineItem[]
  userId: string
  containerRef: React.RefObject<HTMLElement | null>
  bottomRef: React.RefObject<Element | null>
}

function getScrollTopForTarget(list: HTMLElement, target: ScrollTarget): number {
  if (target === 'bottom') return list.scrollHeight - list.clientHeight

  return (
    list.scrollTop +
    target.element.getBoundingClientRect().top -
    list.getBoundingClientRect().top -
    (list.clientHeight - target.element.offsetHeight) / 2
  )
}

/**
 * Управляет скролл-логикой чата:
 * - Автоскролл при новых сообщениях
 * - Прилипание к низу при изменении размера контейнера
 * - `isNearBottom` (с допуском NEAR_BOTTOM_PX)
 * - `scrollToBottom` для кнопки «вниз»
 * - CSS-переменная --scrollbar-w (ширина скроллбара)
 */
export function useChatScroll({ containerRef, bottomRef, timeline, userId }: UseChatScrollParams): {
  isNearBottom: boolean
  scrollToBottom: () => void
  scrollToItem: (localId: string) => void
} {
  // Ref источник истины, state намеренно отстаёт: пока идёт плавный автоскролл он заморожен
  const [isNearBottom, setIsNearBottom] = useState(true)
  const isNearBottomRef = useRef(true)

  const isAutoScrollingRef = useRef(false)
  const lastMessageIdRef = useRef<string | null>(null)

  const scrollListTo = useCallback(
    (target: ScrollTarget, behavior: ScrollBehavior): void => {
      const list = containerRef.current
      if (!list) return

      const targetTop = getScrollTopForTarget(list, target)
      const maxTop = list.scrollHeight - list.clientHeight
      const top = Math.max(0, Math.min(targetTop, maxTop))

      if (behavior === 'smooth') {
        const distance = top - list.scrollTop
        if (Math.abs(distance) > SMOOTH_TAIL_PX) {
          list.scrollTop = top - Math.sign(distance) * SMOOTH_TAIL_PX
        }
        list.scrollTo({ top, behavior })
      } else {
        list.scrollTop = top
      }
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
    scrollListTo('bottom', behavior)
  }, [timeline, userId, containerRef, scrollListTo])

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
      const atBottom = list.scrollHeight - list.clientHeight - list.scrollTop <= NEAR_BOTTOM_PX

      // На длинных прыжках scrollListTo мгновенно перемещается почти к цели, а последние
      // SMOOTH_TAIL_PX доезжает smooth-анимацией — 'scrollend' на этот прыжок приходит раньше,
      // чем хвост доедет. Игнорируем такой преждевременный scrollend, ждём настоящий.
      if (isAutoScrollingRef.current && !atBottom) return

      isNearBottomRef.current = atBottom
      isAutoScrollingRef.current = false
      setIsNearBottom(atBottom)
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
        scrollListTo('bottom', 'auto')
      }
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [containerRef, scrollListTo])

  const scrollToBottom = useCallback(() => {
    scrollListTo('bottom', 'smooth')
  }, [scrollListTo])

  // Скролл к сообщению по localId с центрированием в видимой области
  const scrollToItem = useCallback(
    (localId: string): void => {
      const list = containerRef.current
      if (!list) return

      const row = list.querySelector<HTMLElement>(`[${ITEM_ID_ATTR}="${CSS.escape(localId)}"]`)
      if (!row) return

      scrollListTo({ element: row, block: 'center' }, 'auto')

      row.animate([{ opacity: 0.78 }, { opacity: 1 }], {
        duration: 1600,
        easing: 'ease-out',
      })
    },
    [containerRef, scrollListTo],
  )

  return { isNearBottom, scrollToBottom, scrollToItem }
}
