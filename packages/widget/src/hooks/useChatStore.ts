import { selectChatUIState } from '../store/selectors'
import type { ChatUIState } from '../store/state'
import { chatStore } from '../store/store'

export function useChatStore<T>(selector: (state: ChatUIState) => T): T {
  return chatStore((state) => selector(selectChatUIState(state)))
}
