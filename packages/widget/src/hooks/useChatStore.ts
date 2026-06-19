import { useSyncExternalStore } from 'react'
import { chatStore } from '../store'

export function useChatStore() {
  const isOpen = useSyncExternalStore(
    chatStore.subscribe,
    () => chatStore.getState().isOpen,
    () => false,
  )
  return { isOpen, closePanel: chatStore.closePanel }
}
