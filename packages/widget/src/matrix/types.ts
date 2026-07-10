import type { MatrixEventType, MsgType } from './consts'

interface BaseClientEvent {
  event_id: string
  state_key?: string
  sender: string
  origin_server_ts: number
}

interface TextMessageContent {
  msgtype: typeof MsgType.Text
  body: string
}

interface NoticeMessageContent {
  msgtype: typeof MsgType.Notice
  body: string
}

export interface RoomMessageEvent extends BaseClientEvent {
  type: typeof MatrixEventType.RoomMessage
  content: TextMessageContent | NoticeMessageContent
}

export interface OperatorCurrentEvent extends BaseClientEvent {
  type: typeof MatrixEventType.OperatorCurrent
  state_key: ''
  content: {
    status: 'active' | 'left'
    operator_id?: string
    displayname?: string
    avatar_url?: string
    since_ts?: number
  }
}

export interface OperatorJoinedEvent extends BaseClientEvent {
  type: typeof MatrixEventType.OperatorJoined
  content: {
    operator_id: string
    displayname: string
    avatar_url?: string
    role: 'human' | 'bot'
  }
}

export interface OperatorLeftEvent extends BaseClientEvent {
  type: typeof MatrixEventType.OperatorLeft
  content: {
    operator_id: string
    reason: 'completed' | 'transferred' | 'timeout'
  }
}

export interface GenericClientEvent extends BaseClientEvent {
  type: string
  content: Record<string, unknown>
}

export type ClientEvent =
  | RoomMessageEvent
  | OperatorCurrentEvent
  | OperatorJoinedEvent
  | OperatorLeftEvent
  | GenericClientEvent

export interface RoomTimeline {
  events: ClientEvent[]
  limited?: boolean
  prev_batch?: string
}

export interface JoinedRoom {
  state: { events: ClientEvent[] }
  timeline: RoomTimeline
  ephemeral?: { events: ClientEvent[] }
}
