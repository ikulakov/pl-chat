import type { ViewportMode } from '@bankchat/protocol'
import type { ReadReceipt } from '../domain/receipts'
import { countUnread } from '../domain/receipts'
import type { TimelineItem } from '../domain/timeline'
import type { ChatStatus } from './state'
import type { ChatStoreState } from './store'

/**
 * API стора для компонентов: подписываться только через эти селекторы.
 *
 * Селектор должен быть дешёвым и возвращать примитив либо стабильную ссылку из стора.
 * Дорогая деривация с новой коллекцией на выходе (например, Set прочитанных eventId)
 * селектором быть не может — она живёт в useMemo компонента.
 */

export function selectStatus(state: ChatStoreState): ChatStatus {
  switch (state.phase) {
    case 'idle':
      return 'idle'
    case 'connecting':
    case 'recovering':
      return 'connecting'
    case 'error':
      return 'error'
    case 'connected':
      return state.room.operator.isActive ? 'active' : 'waiting'
  }
}

export function selectUserId(state: ChatStoreState): string | null {
  return state.identity?.userId ?? null
}

export function selectIsOpen(state: ChatStoreState): boolean {
  return state.isOpen
}

export function selectViewport(state: ChatStoreState): ViewportMode {
  return state.viewport
}

export function selectTimeline(state: ChatStoreState): TimelineItem[] {
  return state.room.timeline
}

export function selectReadReceipts(state: ChatStoreState): Record<string, ReadReceipt> {
  return state.room.readReceipts
}

export function selectUnreadCount(state: ChatStoreState): number {
  const userId = selectUserId(state)
  if (userId === null) return 0

  return countUnread(state.room.readReceipts, state.room.timeline, userId)
}
