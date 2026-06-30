import type { ClientEvent, JoinedRoom } from '../types/matrix'

export type RuntimeAction =
  | { type: 'connection.connecting' }
  | { type: 'session.started'; identity: Identity; cursor: string; joinedRoom: JoinedRoom }
  | { type: 'connection.failed'; error: string }
  | { type: 'sync.received'; cursor: string; joinedRoom?: JoinedRoom | undefined }
  | { type: 'message.optimisticAdded'; message: ChatMessage }
  | { type: 'message.sent'; localId: string; eventId: string }
  | { type: 'message.failed'; localId: string }

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
  localId: string
  eventId: string
  sender: string
  body: string
  ts: number
  pending: boolean
  failed: boolean
}

export type Phase = 'idle' | 'connecting' | 'connected' | 'error'

export interface ChatUIState {
  isOpen: boolean
  status: ConnectionStatus
  userId: string | null
  error: string | null
  messages: ChatMessage[]
}

export type ConnectionStatus = 'idle' | 'connecting' | 'waiting' | 'active' | 'error'
