import { getChatController } from '../chatController'

export function useChatActions() {
  const controller = getChatController()

  return {
    sendMessage: controller.sendMessage,
    resendMessage: controller.resendMessage,
    reconnect: controller.reconnect,
    open: controller.open,
    close: controller.close,
  }
}
