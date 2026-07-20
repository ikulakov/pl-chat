import { getChatController } from '../chatController'

export function useChatActions() {
  const controller = getChatController()

  return {
    sendMessage: controller.sendMessage,
    resendMessage: controller.resendMessage,
    markRead: controller.markRead,
    loadMoreHistory: controller.loadMoreHistory,
    stopLoadingHistory: controller.stopLoadingHistory,
    reconnect: controller.reconnect,
    open: controller.open,
    close: controller.close,
  }
}
