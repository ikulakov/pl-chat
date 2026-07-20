import type { ClientEvent, JoinedRoom } from './types'

export interface RegisterResponse {
  user_id: string
  device_id: string
  access_token: string
  refresh_token?: string
  expires_in_ms?: number
}

export interface SyncResponse {
  next_batch: string
  rooms?: { join?: Record<string, JoinedRoom> }
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
