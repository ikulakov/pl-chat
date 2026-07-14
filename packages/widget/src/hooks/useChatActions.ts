import { getChatController } from '../chatController'

export function useChatActions() {
  const controller = getChatController()

  return {
    sendMessage: controller.sendMessage,
    resendMessage: controller.resendMessage,
    markRead: controller.markRead,
    reconnect: controller.reconnect,
    open: controller.open,
    close: controller.close,
  }
}
