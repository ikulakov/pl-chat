import type { MatrixEventType } from '../shared/matrixConst'

interface BaseClientEvent {
  event_id: string
  state_key?: string | undefined
  sender: string
  origin_server_ts: number
}

export interface RoomMessageEvent extends BaseClientEvent {
  type: typeof MatrixEventType.RoomMessage
  content: { msgtype: string; body: string; url?: string | undefined }
}

export interface OperatorCurrentEvent extends BaseClientEvent {
  type: typeof MatrixEventType.OperatorCurrent
  content: { status?: string | undefined }
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
