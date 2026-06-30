import type { ChatMessage } from '../store/model'
import type { JoinedRoom } from '../types/matrix'
import type { SyncResponse } from '../types/requests'
import { setAccessToken } from './httpClient'
import { matrixApi, type MatrixApi } from './matrixApi'

export function findRoomId(sync: SyncResponse): string | null {
  const joined = sync.rooms?.join
  if (!joined) return null
  return Object.keys(joined)[0] ?? null
}

export interface GuestSession {
  userId: string
  roomId: string
  cursor: string
  initialRoom: JoinedRoom
}

export async function startGuestSession(api: MatrixApi = matrixApi): Promise<GuestSession> {
  const guest = await api.registerGuest()
  setAccessToken(guest.access_token)

  const sync = await api.initialSync()

  const roomId = findRoomId(sync)
  const joined = roomId ? sync.rooms?.join?.[roomId] : undefined
  if (!roomId || !joined) throw new Error('support_room_not_found')

  return {
    userId: guest.user_id,
    roomId,
    cursor: sync.next_batch,
    initialRoom: joined,
  }
}

export interface OutgoingText {
  message: ChatMessage
  txnId: string
}

// Строит оптимистичный черновик (мгновенно в timeline) + отдельный txnId для PUT.
export function createOptimisticTextMessage(sender: string, text: string): OutgoingText {
  const localId = crypto.randomUUID()
  return {
    message: {
      localId,
      eventId: `optimistic:${localId}`,
      sender,
      body: text,
      ts: Date.now(),
      pending: true,
      failed: false,
    },
    txnId: crypto.randomUUID(),
  }
}
