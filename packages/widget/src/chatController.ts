import type { HostCommand } from '@bankchat/protocol'
import type { HostBridge } from './bridge'
import type { ReplyTarget } from './domain/reply'
import type { CatalogService } from './matrix/catalog/matrixCatalog'
import { createMatrixClient, type MatrixClient } from './matrix/createMatrixClient'
import type { MatrixService } from './matrix/matrixController'
import type { MediaService } from './matrix/media/matrixMedia'
import { chatStore } from './store/store'
interface PanelActions {
  replyTo: (target: ReplyTarget) => void
  cancelReply: () => void
  reconnect: () => void
  open: () => void
  close: () => void
}

export type ChatActions = Omit<MatrixService, 'connect' | 'disconnect'> &
  CatalogService &
  MediaService &
  PanelActions

export class ChatController {
  private readonly bridge: HostBridge
  private readonly matrix: MatrixService

  // Стабильная ссылка — собирается в конструкторе, не пересоздаётся на рендер.
  readonly actions: ChatActions

  constructor(bridge: HostBridge, client?: MatrixClient) {
    this.bridge = bridge
    this.bridge.setCommandHandler(this.handleHostCommand)

    const { matrix, catalog, media } =
      client ??
      createMatrixClient({
        dispatch: (action) => chatStore.getState().dispatch(action),
        getState: chatStore.getState,
      })

    this.matrix = matrix

    this.actions = {
      sendMessage: (...args) => matrix.sendMessage(...args),
      sendFile: (...args) => matrix.sendFile(...args),
      sendSticker: (...args) => matrix.sendSticker(...args),
      sendCardAction: (...args) => matrix.sendCardAction(...args),
      loadPreview: (...args) => media.loadPreview(...args),
      downloadFile: (...args) => media.downloadFile(...args),
      cancelUpload: (...args) => matrix.cancelUpload(...args),
      resendMessage: (...args) => matrix.resendMessage(...args),
      markRead: (...args) => matrix.markRead(...args),
      toggleReaction: (...args) => matrix.toggleReaction(...args),
      loadMoreHistory: (...args) => matrix.loadMoreHistory(...args),
      stopLoadingHistory: (...args) => matrix.stopLoadingHistory(...args),
      loadEmojiCatalog: (...args) => catalog.loadEmojiCatalog(...args),
      loadEmojiCategory: (...args) => catalog.loadEmojiCategory(...args),
      loadEmojiIndex: (...args) => catalog.loadEmojiIndex(...args),
      loadEmojiAnimation: (...args) => catalog.loadEmojiAnimation(...args),
      loadStickerPacks: (...args) => catalog.loadStickerPacks(...args),
      loadStickerAnimation: (...args) => catalog.loadStickerAnimation(...args),
      replyTo: this.replyTo,
      cancelReply: this.cancelReply,
      reconnect: this.reconnect,
      open: this.open,
      close: this.close,
    }
  }

  private handleHostCommand = (cmd: HostCommand): void => {
    switch (cmd.type) {
      case 'OPEN':
        this.open()
        break
      case 'CLOSE':
        this.close()
        break
      case 'TOGGLE':
        if (chatStore.getState().isOpen) this.close()
        else this.open()
        break
      case 'INIT':
        if (cmd.payload.viewport) {
          chatStore.getState().setViewport(cmd.payload.viewport)
        }
        break
      case 'SET_VIEWPORT':
        chatStore.getState().setViewport(cmd.payload.mode)
        break
    }
  }

  replyTo = (target: ReplyTarget): void => {
    chatStore.getState().dispatch({ type: 'reply.targeted', target })
  }

  cancelReply = (): void => {
    chatStore.getState().dispatch({ type: 'reply.cleared' })
  }

  reconnect = (): void => {
    void this.matrix.connect()
  }

  destroy = (): void => {
    this.matrix.disconnect()
  }

  open = (): void => {
    if (chatStore.getState().isOpen) return

    chatStore.getState().openPanel()
    this.bridge.send({ type: 'OPENED' })
    void this.matrix.connect()
  }

  close = (): void => {
    if (!chatStore.getState().isOpen) return

    chatStore.getState().closePanel()
    this.bridge.send({ type: 'CLOSED' })
  }
}

let _controller: ChatController

export function initChatController(bridge: HostBridge): ChatController {
  _controller = new ChatController(bridge)
  return _controller
}

export function getChatController(): ChatController {
  if (!_controller) throw new Error('[PLChat] Controller not initialized')
  return _controller
}
