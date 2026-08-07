import { type ChatActions, getChatController } from '../chatController'

export function useChatActions(): ChatActions {
  return getChatController().actions
}
