import type { MsgType, RelType } from './consts'
import type { ClientEvent, JoinedRoom, MediaInfo, WithRelation } from './types'

export interface OutgoingTextContent extends WithRelation {
  msgtype: typeof MsgType.Text
  body: string
}

export interface OutgoingMediaContent extends WithRelation {
  msgtype: typeof MsgType.Image | typeof MsgType.File
  body: string
  url: string
  filename: string
  info: MediaInfo
}

export interface OutgoingAdaptiveActionContent {
  msgtype: typeof MsgType.AdaptiveAction
  body: string
  adaptive_action: {
    action_id: string
    source_event_id: string
    data: Record<string, unknown>
  }
  'm.relates_to': { rel_type: 'm.reference'; event_id: string }
}

/**
 * `m.sticker` — ровно `{body, info, url}` из каталога, без `msgtype` (у типа события своего
 * msgtype нет) и намеренно без `WithRelation`: `RoomStickerContentDto` на бэкенде поля связи не
 * содержит, а `FAIL_ON_UNKNOWN_PROPERTIES` там выключен — присланная цитата молча потерялась бы.
 */
export interface OutgoingStickerContent {
  body: string
  url: string
  info: MediaInfo
}

export type OutgoingContent =
  | OutgoingTextContent
  | OutgoingMediaContent
  | OutgoingAdaptiveActionContent
  | OutgoingStickerContent

export interface OutgoingReactionContent {
  'm.relates_to': {
    rel_type: typeof RelType.Annotation
    event_id: string
    key: string
  }
}

export interface OutgoingRedactionContent {
  redacts: string
}

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
