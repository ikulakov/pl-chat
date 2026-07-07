import type { ViewportMode } from '@bankchat/protocol'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { chatRuntimeReducer } from './chatRuntimeReducer'
import type { ChatRuntimeState, RoomState, RuntimeAction } from './model'

export interface ChatStoreState extends ChatRuntimeState {
  isOpen: boolean
  viewport: ViewportMode
  dispatch: (action: RuntimeAction) => void
  openPanel: () => void
  closePanel: () => void
  setViewport: (mode: ViewportMode) => void
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
        viewport: 'docked',
        ...INITIAL_RUNTIME_STATE,

        dispatch: (action) => set((state) => chatRuntimeReducer(state, action), false, action),
        openPanel: () => set({ isOpen: true }, false, 'panel.opened'),
        closePanel: () => set({ isOpen: false }, false, 'panel.closed'),
        setViewport: (mode) => set({ viewport: mode }, false, 'viewport.changed'),
      }),
      { name: 'PLChat', enabled: import.meta.env.DEV },
    ),
  )
}

export const chatStore = createChatStore()
