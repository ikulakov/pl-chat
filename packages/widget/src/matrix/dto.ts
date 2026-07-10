import type { JoinedRoom } from './types'

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
