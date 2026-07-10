import type { ViewportMode } from '@bankchat/protocol'
import type { ClientEvent, JoinedRoom } from '../types/matrix'

export type RuntimeAction =
  | { type: 'connection.connecting' }
  | { type: 'session.started'; identity: Identity; cursor: string; joinedRoom: JoinedRoom }
  | { type: 'connection.failed'; error: string }
  | { type: 'session.recovering' }
  | { type: 'sync.received'; cursor: string; joinedRoom?: JoinedRoom }
  | { type: 'message.optimisticAdded'; message: ChatMessage }
  | { type: 'message.sent'; localId: string; eventId: string }
  | { type: 'message.failed'; localId: string }
  | { type: 'message.retrying'; localId: string }

export interface ChatRuntimeState {
  phase: Phase
  error: string | null
  identity: Identity | null
  cursor: string | null
  room: RoomState
}

export interface RoomState {
  timeline: ClientEvent[]
  messages: ChatMessage[]
  operator: OperatorState
}

export interface OperatorState {
  isActive: boolean
  id: string | null
  displayName: string | null
}

export interface Identity {
  userId: string
  roomId: string
}

export interface ChatMessage {
  // React key, якорь для optimistic-обновлений
  localId: string
  // id события в комнате от сервера; до ответа — placeholder `optimistic:{localId}`
  eventId: string
  // idempotency-ключ запроса PUT /send
  txnId?: string
  sender: string
  body: string
  ts: number
  pending: boolean
  failed: boolean
}

export type Phase = 'idle' | 'connecting' | 'recovering' | 'connected' | 'error'

export type MessageStatus = 'sending' | 'sent' | 'read' | 'failed'

export interface ChatUIState {
  isOpen: boolean
  status: ConnectionStatus
  userId: string | null
  error: string | null
  messages: ChatMessage[]
  viewport: ViewportMode
}

export type ConnectionStatus = 'idle' | 'connecting' | 'waiting' | 'active' | 'error'
