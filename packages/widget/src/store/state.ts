import type { CardAnswer } from '@/domain/adaptiveCards'
import type { EventId, LocalId, MediaId, RoomId, UserId } from '@/domain/ids'
import type { UploadFailure } from '@/domain/mediaFailure'
import type { MediaVerdict, MediaVerdictEntry } from '@/domain/mediaVerdict'
import type { OperatorState } from '@/domain/operator'
import type {
  ReactionConfirmation,
  ReactionDelta,
  ReactionEntry,
  ReactionIndex,
} from '@/domain/reactions'
import type { ReadReceipt } from '@/domain/receipts'
import type { ReplyTarget } from '@/domain/reply'
import type { RoomSyncPatch } from '@/domain/roomSync'
import type { TimelineItem } from '@/domain/timeline'

export type RuntimeAction =
  | { type: 'session.starting' }
  | { type: 'session.started'; identity: Identity; cursor: string; room: RoomSyncPatch }
  | { type: 'session.recovering' }
  | { type: 'session.failed' }
  | { type: 'session.closed' }
  | { type: 'network.lost' }
  | { type: 'network.restored' }
  | { type: 'sync.received'; cursor: string; room?: RoomSyncPatch }
  | { type: 'message.optimisticAdded'; message: TimelineItem }
  | { type: 'message.sent'; localId: LocalId; eventId: EventId }
  | { type: 'message.failed'; localId: LocalId; upload?: UploadFailure }
  | { type: 'message.retrying'; localId: LocalId }
  | { type: 'message.uploadProgress'; localId: LocalId; pct: number }
  | { type: 'message.uploaded'; localId: LocalId; url: string }
  | { type: 'message.discarded'; localId: LocalId }
  | { type: 'receipt.markedRead'; userId: UserId; eventId: EventId }
  | { type: 'receipt.sendFailed'; userId: UserId; eventId: EventId; rollbackTo: EventId | null }
  | { type: 'reaction.added'; targetEventId: EventId; entry: ReactionEntry }
  | { type: 'reaction.confirmed'; targetEventId: EventId; reaction: ReactionConfirmation }
  | { type: 'reaction.removed'; targetEventId: EventId; eventId: EventId }
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
  | { type: 'card.answering'; cardEventId: EventId; actionId: string }
  | { type: 'card.answered'; cardEventId: EventId }
  | { type: 'card.answerFailed'; cardEventId: EventId }

export interface ChatRuntimeState {
  phase: SessionPhase
  online: boolean
  identity: Identity | null
  cursor: string | null
  room: RoomState
}

export interface RoomState {
  timeline: TimelineItem[]
  operator: OperatorState
  // m.read по юзерам: до какого события каждый дочитал
  readReceipts: Record<UserId, ReadReceipt>
  // реакции по id сообщения; отдельно от ленты — приходят раньше своей цели и переживают merge
  reactions: ReactionIndex
  // ответы на Adaptive Card по cardEventId — переживают merge ленты и перезагрузку,
  // поэтому не элемент timeline (ответ клиента и не рисуется пузырём в ленте)
  cardAnswers: Record<EventId, CardAnswer>
  // результат проверки вложений (kc.media.status) по media_id:
  // бэкенд шлёт один вердикт на файл, а не на каждое упоминание
  mediaVerdicts: Record<MediaId, MediaVerdict>
  // сообщение, на которое пользователь отвечает (превью в композере)
  replyTarget: ReplyTarget | null
  // курсор следующей страницы истории назад
  prevBatch: string | null
  isLoadingHistory: boolean
}

export interface Identity {
  userId: UserId
  roomId: RoomId
}

/**
 * - `connecting` — первое подключение: регистрация и initial sync
 * - `retrying` — повтор по кнопке с экрана ошибки
 * - `recovering` — сессия умерла на ходу (auth-ошибка), тихо поднимаем новую без участия пользователя
 */
export type SessionPhase = 'idle' | 'connecting' | 'retrying' | 'recovering' | 'ready' | 'error'

export type PanelView = 'loading' | 'error' | 'chat'

export type HeaderStatus = 'connecting' | 'offline' | 'bot' | 'operator' | 'error'
