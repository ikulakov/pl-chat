import type { StoreApi, UseBoundStore } from 'zustand'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { HostBridge } from '../bridge'
import { createConnectionSlice, type ConnectionSlice } from './connection.slice'
import { createMessagesSlice, type MessagesSlice } from './messages.slice'
import { createPanelSlice, type PanelSlice } from './panel.slice'

let _store: UseBoundStore<StoreApi<ChatState>>

export function createChatStore(bridge: HostBridge): UseBoundStore<StoreApi<ChatState>> {
  return create<ChatState>()(
    devtools((...args) => ({
      ...createPanelSlice(bridge)(...args),
      ...createConnectionSlice(...args),
      ...createMessagesSlice(...args),
    })),
  )
}

export function initChatStore(bridge: HostBridge): UseBoundStore<StoreApi<ChatState>> {
  _store = createChatStore(bridge)
  bridge.connect((cmd) => _store.getState().handleCommand(cmd))
  return _store
}

export function useChatStore<T>(selector: (state: ChatState) => T): T {
  if (!_store) throw new Error('useChatStore called before initChatStore')
  return _store(selector)
}

export type ChatState = PanelSlice & ConnectionSlice & MessagesSlice
