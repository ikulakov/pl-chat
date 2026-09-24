import type { CardAnswer } from '@/domain/adaptiveCards'
import type { MediaVerdict } from '@/domain/mediaVerdict'
import type { ReactionEntry } from '@/domain/reactions'
import type { ReadReceipt } from '@/domain/receipts'
import { countUnread } from '@/domain/receipts'
import type { ReplyTarget } from '@/domain/reply'
import type { TimelineItem } from '@/domain/timeline'
import { isSystem } from '@/domain/timeline'
import type { EventId, MediaId, UserId } from '@/shared/types/ids'
import type { ViewportMode } from '@bankchat/protocol'
import type { HeaderStatus, PanelView, SessionPhase } from './state'
import type { ChatStoreState } from './store'

/**
 * API стора для компонентов: подписываться только через эти селекторы.
 *
 * Селектор должен быть дешёвым и возвращать примитив либо стабильную ссылку из стора.
 * Дорогая деривация с новой коллекцией на выходе (например, Set прочитанных eventId)
 * селектором быть не может — она живёт в useMemo компонента.
 *
 * Селектор данных одного id — фабрика с суффиксом `For`: `useChatStore(selectCardAnswerFor(id))`.
 * Новая функция на каждом рендере безопасна — сравнивается результат, а он из стора.
 */

export function selectPhase(state: ChatStoreState): SessionPhase {
  return state.phase
}

export function selectHeaderStatus(state: ChatStoreState): HeaderStatus {
  switch (state.phase) {
    case 'idle':
    case 'connecting':
    case 'retrying':
    case 'recovering':
      return 'connecting'
    case 'error':
      return 'error'
    case 'ready':
      if (!state.online) return 'offline'

      return state.room.operator.isActive ? 'operator' : 'bot'
  }
}

export function selectPanelView(state: ChatStoreState): PanelView {
  switch (state.phase) {
    case 'idle':
    case 'connecting':
    case 'recovering':
      return 'loading'
    case 'retrying':
    case 'error':
      return 'error'
    case 'ready':
      return 'chat'
  }
}

export function selectOperatorDisplayName(state: ChatStoreState): string | null {
  return state.room.operator.displayName
}

export function selectUserId(state: ChatStoreState): UserId | null {
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

export function selectHasMessages(state: ChatStoreState): boolean {
  return !state.room.timeline.every(isSystem)
}

export function selectReadReceipts(state: ChatStoreState): Record<UserId, ReadReceipt> {
  return state.room.readReceipts
}

export function selectReactionsFor(
  eventId: EventId,
): (state: ChatStoreState) => ReactionEntry[] | undefined {
  return (state) => state.room.reactions[eventId]
}

export function selectCardAnswerFor(
  eventId: EventId,
): (state: ChatStoreState) => CardAnswer | undefined {
  return (state) => state.room.cardAnswers[eventId]
}

export function selectMediaVerdictStatusFor(
  mediaId: MediaId | undefined,
): (state: ChatStoreState) => MediaVerdict['status'] | undefined {
  return (state) => (mediaId ? state.room.mediaVerdicts[mediaId]?.status : undefined)
}

export function selectReplyTarget(state: ChatStoreState): ReplyTarget | null {
  return state.room.replyTarget
}

export function selectIsLoadingHistory(state: ChatStoreState): boolean {
  return state.room.isLoadingHistory
}

export function selectUnreadCount(state: ChatStoreState): number {
  const userId = selectUserId(state)
  if (userId === null) return 0

  return countUnread(state.room.readReceipts, state.room.timeline, userId)
}
