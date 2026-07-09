import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { chatRuntimeReducer } from './chatRuntimeReducer'
import type { ChatRuntimeState, RoomState, RuntimeAction } from './model'

export interface ChatStoreState extends ChatRuntimeState {
  isOpen: boolean
  dispatch: (action: RuntimeAction) => void
  openPanel: () => void
  closePanel: () => void
}

export const INITIAL_ROOM_STATE: RoomState = {
  timeline: [],
  messages: [],
  operator: {
    id: null,
    displayName: null,
    isActive: false,
  },
}

export const INITIAL_RUNTIME_STATE: ChatRuntimeState = {
  phase: 'idle',
  error: null,
  identity: null,
  cursor: null,
  room: INITIAL_ROOM_STATE,
}

export function createChatStore() {
  return create<ChatStoreState>()(
    devtools(
      (set) => ({
        isOpen: false,
        ...INITIAL_RUNTIME_STATE,

        dispatch: (action) => set((state) => chatRuntimeReducer(state, action), false, action),
        openPanel: () => set({ isOpen: true }, false, 'panel.opened'),
        closePanel: () => set({ isOpen: false }, false, 'panel.closed'),
      }),
      { name: 'PLChat', enabled: import.meta.env.DEV },
    ),
  )
}

export const chatStore = createChatStore()
