import type { ChatUIState } from '../store/model'
import { selectChatUIState } from '../store/selectors'
import { chatStore } from '../store/store'

export function useChatStore<T>(selector: (state: ChatUIState) => T): T {
  return chatStore((state) => selector(selectChatUIState(state)))
}
