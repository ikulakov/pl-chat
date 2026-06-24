import type { StateCreator } from 'zustand'
import { setAccessToken } from '../api/httpClient'
import { matrixApi } from '../api/matrixApi'
import { findRoomId, isOperatorActive, mergeMessages, timelineToMessages } from '../api/syncParsers'
import { sleep } from '../shared/sleep'
import type { JoinedRoom } from '../types/matrix'
import type { MessagesSlice } from './messages.slice'

export type ConnectionStatus = 'idle' | 'connecting' | 'waiting' | 'active' | 'error'

export interface Session {
  userId: string
  roomId: string
  syncCursor: string
}

export interface ConnectionSlice {
  status: ConnectionStatus
  session: Session | null
  error: string | null
  isSyncing: boolean
  startSession: () => Promise<void>
  retry: () => void
}

type BoundStore = ConnectionSlice & MessagesSlice

const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

export const createConnectionSlice: StateCreator<BoundStore, [], [], ConnectionSlice> = (
  set,
  get,
) => {
  const guestConnect = async (): Promise<void> => {
    const { status } = get()
    if (status !== 'idle' && status !== 'error') return

    set({ status: 'connecting', error: null })

    try {
      const guest = await matrixApi.registerGuest()
      setAccessToken(guest.access_token)
      const sync = await matrixApi.initialSync()

      const roomId = findRoomId(sync)
      if (!roomId) {
        set({ status: 'error', error: 'Комната поддержки не найдена' })
        return
      }
      const room = sync.rooms?.join?.[roomId]

      set({
        session: { userId: guest.user_id, roomId, syncCursor: sync.next_batch },
        status: isOperatorActive(room?.state.events) ? 'active' : 'waiting',
        messages: timelineToMessages(room?.timeline.events),
      })
    } catch (err) {
      console.error('[BankChat] guestConnect failed:', err)
      set({ status: 'error', error: 'Не удалось подключиться' })
    }
  }

  const runLoop = async (): Promise<void> => {
    let backoff = INITIAL_BACKOFF_MS

    while (get().isSyncing) {
      const session = get().session
      if (!session) {
        set({ isSyncing: false })
        break
      }
      try {
        const resp = await matrixApi.longPollSync(session.syncCursor)
        if (!get().isSyncing) break
        backoff = INITIAL_BACKOFF_MS

        set({ session: { ...session, syncCursor: resp.next_batch } })

        const room: JoinedRoom | undefined = resp.rooms?.join?.[session.roomId]
        if (!room) continue

        const newMessages = timelineToMessages(room.timeline.events)
        if (newMessages.length > 0) {
          set((s) => ({ messages: mergeMessages(s.messages, newMessages) }))
        }

        if (isOperatorActive(room.state.events) && get().status === 'waiting') {
          set({ status: 'active' })
        }
      } catch (err) {
        if (!get().isSyncing) break

        console.error('[BankChat] sync error, retrying in', backoff, 'ms:', err)
        await sleep(backoff)
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
      }
    }
  }

  return {
    status: 'idle',
    session: null,
    error: null,
    isSyncing: false,

    startSession: async () => {
      await guestConnect()
      if (get().status !== 'error' && !get().isSyncing) {
        set({ isSyncing: true })
        void runLoop()
      }
    },

    retry: () => {
      void get().startSession()
    },
  }
}
