import type { ViewportMode } from '@bankchat/protocol'
import type { OperatorState } from '../domain/operator'
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

export interface ChatRuntimeState {
  phase: Phase
  error: string | null
  identity: Identity | null
  cursor: string | null
  room: RoomState
}

export interface RoomState {
  timeline: TimelineItem[]
  operator: OperatorState
}

export interface Identity {
  userId: string
  roomId: string
}

export type Phase = 'idle' | 'connecting' | 'recovering' | 'connected' | 'error'

export interface ChatUIState {
  isOpen: boolean
  status: ConnectionStatus
  userId: string | null
  error: string | null
  timeline: TimelineItem[]
  viewport: ViewportMode
}

export type ConnectionStatus = 'idle' | 'connecting' | 'waiting' | 'active' | 'error'
