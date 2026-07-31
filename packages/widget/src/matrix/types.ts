import type { MatrixEventType, MsgType } from './consts'

interface BaseClientEvent {
  event_id: string
  // Наличие поля (даже '') — признак state event
  state_key?: string
  sender: string
  origin_server_ts: number
  unsigned?: { transaction_id?: string }
}

// Связь события с другим. Reply по Matrix-спеке — без rel_type, только вложенный m.in_reply_to
export interface RelatesTo {
  'm.in_reply_to'?: { event_id: string }
}

export interface TextMessageContent {
  msgtype: typeof MsgType.Text
  body: string
  'm.relates_to'?: RelatesTo
}

interface NoticeMessageContent {
  msgtype: typeof MsgType.Notice
  body: string
}

export interface MediaMessageContent {
  body: string
  url: string
  filename?: string
  info?: { mimetype?: string; size?: number; w?: number; h?: number }
}

interface ImageMessageContent extends MediaMessageContent {
  msgtype: typeof MsgType.Image
}

interface FileMessageContent extends MediaMessageContent {
  msgtype: typeof MsgType.File
}

export interface RoomMessageEvent extends BaseClientEvent {
  type: typeof MatrixEventType.RoomMessage
  content: TextMessageContent | NoticeMessageContent | ImageMessageContent | FileMessageContent
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

export interface ReceiptEvent {
  type: typeof MatrixEventType.Receipt
  content: Record<
    string,
    {
      'm.read'?: Record<string, { ts?: number }>
    }
  >
}

export interface GenericEphemeralEvent {
  type: string
  content: Record<string, unknown>
}

export type EphemeralEvent = ReceiptEvent | GenericEphemeralEvent

export interface RoomTimeline {
  events: ClientEvent[]
  limited?: boolean
  prev_batch?: string
}

export interface JoinedRoom {
  state: { events: ClientEvent[] }
  timeline: RoomTimeline
  ephemeral?: { events: EphemeralEvent[] }
}
