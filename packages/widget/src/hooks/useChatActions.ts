import { getChatController } from '../chatController'

export function useChatActions() {
  const controller = getChatController()
  return { sendMessage: controller.sendMessage, retry: controller.retry }
}
