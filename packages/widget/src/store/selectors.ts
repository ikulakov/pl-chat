import type { ViewportMode } from '@bankchat/protocol'
import type { CardAnswer } from '../domain/adaptiveCards'
import type { MediaVerdict } from '../domain/mediaVerdict'
import type { ReactionIndex } from '../domain/reactions'
import type { ReadReceipt } from '../domain/receipts'
import { countUnread } from '../domain/receipts'
import type { TimelineItem } from '../domain/timeline'
import type { ChatStatus, ReplyTarget } from './state'
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
    case 'ready':
      if (!state.online) return 'offline'

      return state.room.operator.isActive ? 'operator' : 'bot'
  }
}

/**
 * Показывать ли ленту с композером.
 *
 * Исчерпывающий `switch`, а не `||`: новое значение `ChatStatus` не соберётся, пока его тут
 * не разложат. С дизъюнкцией забытое значение молча скрыло бы всю панель.
 */
export function isChatting(status: ChatStatus): boolean {
  switch (status) {
    case 'bot':
    case 'operator':
    case 'offline':
      return true
    case 'idle':
    case 'connecting':
    case 'error':
      return false
  }
}

/**
 * Связи нет, но мы её ждём: первое подключение, восстановление сессии, обрыв при живой ленте.
 * В `error` — `false`: попытки кончились, ждать нечего.
 */
export function isConnectionPending(status: ChatStatus): boolean {
  switch (status) {
    case 'idle':
    case 'connecting':
    case 'offline':
      return true
    case 'bot':
    case 'operator':
    case 'error':
      return false
  }
}

export function selectOperatorDisplayName(state: ChatStoreState): string | null {
  return state.room.operator.displayName
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

export function selectReactions(state: ChatStoreState): ReactionIndex {
  return state.room.reactions
}

export function selectCardAnswers(state: ChatStoreState): Record<string, CardAnswer> {
  return state.room.cardAnswers
}

export function selectMediaVerdicts(state: ChatStoreState): Record<string, MediaVerdict> {
  return state.room.mediaVerdicts
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
