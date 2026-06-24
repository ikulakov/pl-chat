import type { JoinedRoom } from './matrix'

export interface RegisterResponse {
  user_id: string
  device_id: string
  access_token: string
  refresh_token?: string | undefined
  expires_in_ms?: number | undefined
}

export interface SyncResponse {
  next_batch: string
  rooms?: { join?: Record<string, JoinedRoom> } | undefined
}
