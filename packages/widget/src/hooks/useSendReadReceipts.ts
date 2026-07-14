import { useEffect, useEffectEvent } from 'react'
import type { TimelineItem } from '../domain/timeline'
import { trailingThrottle } from '../shared/trailingThrottle'
import { useChatActions } from './useChatActions'

export const SCAN_THROTTLE_MS = 500

export const RECEIPT_ID_ATTR = 'data-receipt-id'

interface UseSendReadReceiptsParams {
  timeline: TimelineItem[]
  isOpen: boolean
  containerRef: React.RefObject<HTMLElement | null>
}

/**
 * Отправка m.read по прочтению сообщений оператора.
 * Элементы берутся из DOM по data-receipt-id — его вешает MessageRow.
 */
export function useSendReadReceipts({ timeline, isOpen, containerRef }: UseSendReadReceiptsParams) {
  const { markRead } = useChatActions()

  const scan = useEffectEvent(() => {
    const list = containerRef.current
    if (!list || document.hidden) return

    const fold = list.getBoundingClientRect().bottom
    const rows = list.querySelectorAll(`[${RECEIPT_ID_ATTR}]`)

    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]!
      if (row.getBoundingClientRect().bottom > fold) continue

      const eventId = row.getAttribute(RECEIPT_ID_ATTR)
      if (eventId) markRead(eventId)
      return
    }
  })

  // Новое событие в ленте / открытие панели.
  useEffect(() => {
    if (isOpen) scan()
  }, [isOpen, timeline])

  // Скролл и возврат на вкладку
  useEffect(() => {
    const list = containerRef.current
    if (!list || !isOpen) return

    const onScroll = trailingThrottle(() => scan(), SCAN_THROTTLE_MS)
    const onVisibility = () => scan()

    list.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      list.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onVisibility)
      onScroll.cancel()
    }
  }, [containerRef, isOpen])
}
