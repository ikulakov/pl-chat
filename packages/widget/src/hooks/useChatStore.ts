import { chatStore, type ChatStoreState } from '../store/store'

export function useChatStore<T>(selector: (state: ChatStoreState) => T): T {
  return chatStore(selector)
}
