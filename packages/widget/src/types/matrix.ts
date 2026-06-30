import type { MatrixEventType } from '../matrix/consts'

interface BaseClientEvent {
  event_id: string
  state_key?: string | undefined
  sender: string
  origin_server_ts: number
}

export interface RoomMessageEvent extends BaseClientEvent {
  type: typeof MatrixEventType.RoomMessage
  content: {
    msgtype: string
    body: string
    url?: string
  }
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

export interface GenericClientEvent extends BaseClientEvent {
  type: Exclude<string, (typeof MatrixEventType)[keyof typeof MatrixEventType]>
  content: Record<string, unknown>
}

export type ClientEvent = RoomMessageEvent | OperatorCurrentEvent | GenericClientEvent

export interface RoomTimeline {
  events: ClientEvent[]
  limited?: boolean | undefined
  prev_batch?: string | undefined
}

export interface JoinedRoom {
  state: { events: ClientEvent[] }
  timeline: RoomTimeline
  ephemeral?: { events: ClientEvent[] } | undefined
}
