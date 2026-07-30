import type { MediaContent } from '../domain/timeline'
import type { MsgType } from './consts'
import type { ClientEvent, JoinedRoom, RelatesTo } from './types'

export interface OutgoingTextContent {
  msgtype: typeof MsgType.Text
  body: string
  'm.relates_to'?: RelatesTo
}

export type OutgoingMediaContent = MediaContent & {
  msgtype: typeof MsgType.Image | typeof MsgType.File
  'm.relates_to'?: RelatesTo
}

export type OutgoingContent = OutgoingTextContent | OutgoingMediaContent

export interface RegisterResponse {
  user_id: string
  device_id: string
  access_token: string
  refresh_token?: string
  expires_in_ms?: number
}

export interface RefreshResponse {
  access_token: string
  refresh_token?: string
}

export interface SyncResponse {
  next_batch: string
  rooms?: { join?: Record<string, JoinedRoom> }
}

export interface UploadResponse {
  content_uri: string
}

export interface SendEventResponse {
  event_id: string
}

/**
 * Ответ GET /rooms/{roomId}/messages.
 *
 * `chunk` при dir=b приходит newest-first — перед склейкой с лентой нужен reverse().
 * `end` — курсор следующей страницы
 * Признак «дошли до начала комнаты» — пустой chunk, а не отсутствие end.
 */
export interface MessagesResponse {
  chunk: ClientEvent[]
  start: string
  end?: string
}
