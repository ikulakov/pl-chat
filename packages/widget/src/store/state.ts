import type { CardAnswer } from '../domain/adaptiveCards'
import type { MediaVerdict, MediaVerdictEntry } from '../domain/mediaVerdict'
import type { OperatorState } from '../domain/operator'
import type { ReactionDelta, ReactionEntry, ReactionIndex } from '../domain/reactions'
import type { ReadReceipt } from '../domain/receipts'
import type { RoomSyncPatch } from '../domain/roomSync'
import type { TimelineItem } from '../domain/timeline'
import type { UploadFailure } from '../domain/uploadError'

export type RuntimeAction =
  | { type: 'connection.connecting' }
  | { type: 'session.started'; identity: Identity; cursor: string; room: RoomSyncPatch }
  | { type: 'connection.failed'; error: string }
  | { type: 'session.recovering' }
  | { type: 'session.closed' }
  | { type: 'sync.received'; cursor: string; room?: RoomSyncPatch }
  | { type: 'message.optimisticAdded'; message: TimelineItem }
  | { type: 'message.sent'; localId: string; eventId: string }
  | { type: 'message.failed'; localId: string; upload?: UploadFailure }
  | { type: 'message.retrying'; localId: string }
  | { type: 'message.uploadProgress'; localId: string; pct: number }
  | { type: 'message.uploaded'; localId: string; url: string }
  | { type: 'message.discarded'; localId: string }
  | { type: 'receipt.markedRead'; userId: string; eventId: string }
  | { type: 'receipt.sendFailed'; userId: string; eventId: string; rollbackTo: string | null }
  | { type: 'reaction.added'; targetEventId: string; entry: ReactionEntry }
  | { type: 'reaction.confirmed'; targetEventId: string; localEventId: string; eventId: string }
  | { type: 'reaction.removed'; targetEventId: string; eventId: string }
  | { type: 'reply.targeted'; target: ReplyTarget }
  | { type: 'reply.cleared' }
  | { type: 'history.loading' }
  | {
      type: 'history.loaded'
      items: TimelineItem[]
      reactions: ReactionDelta
      cardAnswers: CardAnswer[]
      mediaVerdicts: MediaVerdictEntry[]
      prevBatch: string | null
    }
  | { type: 'history.settled' }
  | { type: 'card.answering'; cardEventId: string; actionId: string }
  | { type: 'card.answered'; cardEventId: string }
  | { type: 'card.answerFailed'; cardEventId: string }

export interface ChatRuntimeState {
  phase: ConnectionPhase
  error: string | null
  identity: Identity | null
  cursor: string | null
  room: RoomState
}

export interface RoomState {
  timeline: TimelineItem[]
  operator: OperatorState
  // m.read по юзерам: до какого события каждый дочитал
  readReceipts: Record<string, ReadReceipt>
  // реакции по id сообщения; отдельно от ленты — приходят раньше своей цели и переживают merge
  reactions: ReactionIndex
  // ответы на Adaptive Card по cardEventId — переживают merge ленты и перезагрузку,
  // поэтому не элемент timeline (ответ клиента и не рисуется пузырём в ленте)
  cardAnswers: Record<string, CardAnswer>
  // результат проверки вложений (kc.media.status) по media_id:
  // бэкенд шлёт один вердикт на файл, а не на каждое упоминание
  mediaVerdicts: Record<string, MediaVerdict>
  // сообщение, на которое пользователь отвечает (превью в композере)
  replyTarget: ReplyTarget | null
  // курсор следующей страницы истории назад
  prevBatch: string | null
  isLoadingHistory: boolean
}

export interface ReplyTarget {
  eventId: string
  sender: string
  body: string
}

export interface Identity {
  userId: string
  roomId: string
}

// Фаза подключения к homeserver — внутреннее состояние стора
export type ConnectionPhase = 'idle' | 'connecting' | 'recovering' | 'connected' | 'error'

// Статус диалога, который видит пользователь
export type ChatStatus = 'idle' | 'connecting' | 'waiting' | 'active' | 'error'
