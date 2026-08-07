import type { MatrixEventType, MediaScanStatus, MsgType } from './consts'

interface BaseClientEvent {
  event_id: string
  // Наличие поля (даже '') — признак state event
  state_key?: string
  sender: string
  origin_server_ts: number
  unsigned?: { transaction_id?: string }
}

export interface WithRelation {
  'm.relates_to'?: {
    'm.in_reply_to'?: { event_id: string }
  }
}

export interface TextMessageContent extends WithRelation {
  msgtype: typeof MsgType.Text
  body: string
}

interface NoticeMessageContent {
  msgtype: typeof MsgType.Notice
  body: string
}

export interface MediaInfo {
  mimetype: string
  size: number
  w?: number
  h?: number
}

export interface MediaMessageContent extends WithRelation {
  body: string
  url: string
  filename?: string
  info?: Partial<MediaInfo>
}

interface ImageMessageContent extends MediaMessageContent {
  msgtype: typeof MsgType.Image
}

interface FileMessageContent extends MediaMessageContent {
  msgtype: typeof MsgType.File
}

export interface AdaptiveCardMessageContent extends WithRelation {
  msgtype: typeof MsgType.AdaptiveCard
  body: string
  card_kind?: string
  adaptive_card: unknown
}

export interface AdaptiveActionMessageContent {
  msgtype: typeof MsgType.AdaptiveAction
  body: string
  adaptive_action: {
    action_id: string
    source_event_id: string
    data?: Record<string, unknown>
  }
  'm.relates_to'?: { rel_type: 'm.reference'; event_id: string }
}

export interface RoomMessageEvent extends BaseClientEvent {
  type: typeof MatrixEventType.RoomMessage
  content:
    | TextMessageContent
    | NoticeMessageContent
    | ImageMessageContent
    | FileMessageContent
    | AdaptiveCardMessageContent
    | AdaptiveActionMessageContent
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

export interface MediaStatusEvent extends BaseClientEvent {
  type: typeof MatrixEventType.MediaStatus
  content: {
    media_id: string
    status: (typeof MediaScanStatus)[keyof typeof MediaScanStatus]
    error?: string
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
  | MediaStatusEvent
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
