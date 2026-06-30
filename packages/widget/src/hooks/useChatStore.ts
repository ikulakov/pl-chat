import { useShallow } from 'zustand/shallow'
import type { ChatUIState } from '../store/model'
import { selectChatUIState } from '../store/selectors'
import { chatStore } from '../store/store'

export function useChatStore<T>(selector: (state: ChatUIState) => T): T {
  return chatStore(useShallow((state) => selector(selectChatUIState(state))))
}
