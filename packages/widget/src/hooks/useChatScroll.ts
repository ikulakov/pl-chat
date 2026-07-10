import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isSystem, type TimelineItem } from '../domain/timeline'
import { useIntersectionObserver } from './useIntersectionObserver'

const NEAR_BOTTOM_PX = 80

interface UseChatScrollParams {
  timeline: TimelineItem[]
  userId: string | null
  containerRef: React.RefObject<HTMLElement | null>
  bottomRef: React.RefObject<Element | null>
}

/**
 * Управляет скролл-логикой чата:
 * - Автоскролл при новых сообщениях
 * - Кнопка "скролл вниз"
 * - Прилипание к низу при изменении размера контейнера
 * - CSS-переменная --scrollbar-w (ширина скроллбара)
 */
export function useChatScroll({ containerRef, bottomRef, timeline, userId }: UseChatScrollParams): {
  showScrollButton: boolean
  scrollToBottom: () => void
} {
  const [showScrollButton, setShowScrollButton] = useState(false)

  const isNearBottomRef = useRef(true)
  const isAutoScrollingRef = useRef(false)
  const lastMessageIdRef = useRef<string | null>(null)

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
    list.scrollTo({ top: list.scrollHeight, behavior })
  }, [timeline, userId, containerRef])

  // Отслеживание bottom чата
  useIntersectionObserver({
    root: containerRef,
    rootMargin: `0px 0px ${NEAR_BOTTOM_PX}px 0px`,
    triggerRef: bottomRef,
    callback: ({ isIntersecting }) => {
      isNearBottomRef.current = isIntersecting
      if (!isAutoScrollingRef.current) {
        setShowScrollButton(!isIntersecting)
      }
    },
  })

  // снятие флага авто-скролла — по остановке скролла
  useEffect(() => {
    const list = containerRef.current
    if (!list) return

    const handleScrollEnd = () => {
      isAutoScrollingRef.current = false
      setShowScrollButton(!isNearBottomRef.current)
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
        list.scrollTo({ top: list.scrollHeight, behavior: 'auto' })
      }
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [containerRef])

  const scrollToBottom = () => {
    const list = containerRef.current
    if (!list) return
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }

  return { showScrollButton, scrollToBottom }
}
