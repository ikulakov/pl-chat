import type { OperatorState } from '../domain/operator'
import type { ReadReceipt } from '../domain/receipts'
import type { TimelineItem } from '../domain/timeline'
import type { JoinedRoom } from '../matrix/types'

export type RuntimeAction =
  | { type: 'connection.connecting' }
  | { type: 'session.started'; identity: Identity; cursor: string; joinedRoom: JoinedRoom }
  | { type: 'connection.failed'; error: string }
  | { type: 'session.recovering' }
  | { type: 'sync.received'; cursor: string; joinedRoom?: JoinedRoom }
  | { type: 'message.optimisticAdded'; message: TimelineItem }
  | { type: 'message.sent'; localId: string; eventId: string }
  | { type: 'message.failed'; localId: string }
  | { type: 'message.retrying'; localId: string }
  | { type: 'receipt.markedRead'; userId: string; eventId: string }
  | { type: 'receipt.sendFailed'; userId: string; eventId: string; rollbackTo: string | null }
  | { type: 'history.loading' }
  | { type: 'history.loaded'; items: TimelineItem[]; prevBatch: string | null }
  | { type: 'history.settled' }

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
  // курсор следующей страницы истории назад
  prevBatch: string | null
  isLoadingHistory: boolean
}

export interface Identity {
  userId: string
  roomId: string
}

// Фаза подключения к homeserver — внутреннее состояние стора
export type ConnectionPhase = 'idle' | 'connecting' | 'recovering' | 'connected' | 'error'

// Статус диалога, который видит пользователь
export type ChatStatus = 'idle' | 'connecting' | 'waiting' | 'active' | 'error'
