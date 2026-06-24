import type { StateCreator } from 'zustand'
import { matrixApi } from '../api/matrixApi'
import type { ConnectionSlice } from './connection.slice'

export interface ChatMessage {
  localId: string
  eventId: string
  sender: string
  body: string
  ts: number
  pending: boolean
  failed: boolean
}

export interface MessagesSlice {
  messages: ChatMessage[]
  sendText: (text: string) => Promise<void>
}

type BoundStore = MessagesSlice & ConnectionSlice

export const createMessagesSlice: StateCreator<BoundStore, [], [], MessagesSlice> = (set, get) => ({
  messages: [],

  sendText: async (text) => {
    const session = get().session
    if (!session) return

    const { roomId, userId } = session
    const localId = crypto.randomUUID()
    const txnId = crypto.randomUUID()

    const optimistic: ChatMessage = {
      localId,
      eventId: `optimistic:${localId}`,
      sender: userId,
      body: text,
      ts: Date.now(),
      pending: true,
      failed: false,
    }
    set((s) => ({ messages: [...s.messages, optimistic] }))

    try {
      const { event_id } = await matrixApi.sendMessage(roomId, txnId, text)
      set((s) => ({
        messages: s.messages.map((m) =>
          m.localId === localId ? { ...m, eventId: event_id, pending: false } : m,
        ),
      }))
    } catch {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.localId === localId ? { ...m, pending: false, failed: true } : m,
        ),
      }))
    }
  },
})
