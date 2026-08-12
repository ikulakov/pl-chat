import type { HostCommand } from '@bankchat/protocol'
import type { HostBridge } from './bridge'
import { createMatrixService } from './matrix/createMatrixService'
import type { MatrixService, SendFileOptions } from './matrix/matrixController'
import type { ThumbnailSize } from './matrix/api/matrixApi'
import type { ReplyTarget } from './store/state'
import { chatStore } from './store/store'

export interface ChatActions {
  sendMessage: (text: string, replyToEventId?: string) => Promise<void>
  sendFile: (file: File, options?: SendFileOptions) => Promise<void>
  loadPreview: (mxcUrl: string, size: ThumbnailSize) => Promise<Blob>
  downloadFile: (mxcUrl: string) => Promise<Blob>
  cancelUpload: (localId: string) => void
  resendMessage: (localId: string) => Promise<void>
  replyTo: (target: ReplyTarget) => void
  cancelReply: () => void
  markRead: (eventId: string) => Promise<void>
  toggleReaction: (targetEventId: string, key: string) => Promise<void>
  loadMoreHistory: () => Promise<void>
  stopLoadingHistory: () => void
  reconnect: () => void
  open: () => void
  close: () => void
}

export class ChatController {
  private readonly bridge: HostBridge
  private readonly matrix: MatrixService

  // Стабильная ссылка — собирается в конструкторе, не пересоздаётся на рендер.
  readonly actions: ChatActions

  constructor(bridge: HostBridge, matrix?: MatrixService) {
    this.bridge = bridge
    this.bridge.setCommandHandler(this.handleHostCommand)

    if (matrix) {
      this.matrix = matrix
    } else {
      this.matrix = createMatrixService({
        dispatch: (action) => chatStore.getState().dispatch(action),
        getState: chatStore.getState,
      })
    }

    this.actions = {
      sendMessage: this.sendMessage,
      sendFile: this.sendFile,
      loadPreview: this.loadPreview,
      downloadFile: this.downloadFile,
      cancelUpload: this.cancelUpload,
      resendMessage: this.resendMessage,
      replyTo: this.replyTo,
      cancelReply: this.cancelReply,
      markRead: this.markRead,
      toggleReaction: this.toggleReaction,
      loadMoreHistory: this.loadMoreHistory,
      stopLoadingHistory: this.stopLoadingHistory,
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

  sendMessage = (text: string, replyToEventId?: string): Promise<void> =>
    this.matrix.sendMessage(text, replyToEventId)

  replyTo = (target: ReplyTarget): void => {
    chatStore.getState().dispatch({ type: 'reply.targeted', target })
  }

  cancelReply = (): void => {
    chatStore.getState().dispatch({ type: 'reply.cleared' })
  }

  sendFile = (file: File, options?: SendFileOptions): Promise<void> =>
    this.matrix.sendFile(file, options)

  loadPreview = (mxcUrl: string, size: ThumbnailSize): Promise<Blob> =>
    this.matrix.loadPreview(mxcUrl, size)

  downloadFile = (mxcUrl: string): Promise<Blob> => this.matrix.downloadFile(mxcUrl)

  cancelUpload = (localId: string): void => this.matrix.cancelUpload(localId)

  resendMessage = (localId: string): Promise<void> => this.matrix.resendMessage(localId)

  markRead = (eventId: string): Promise<void> => this.matrix.markRead(eventId)

  toggleReaction = (targetEventId: string, key: string): Promise<void> =>
    this.matrix.toggleReaction(targetEventId, key)

  loadMoreHistory = (): Promise<void> => this.matrix.loadMoreHistory()

  stopLoadingHistory = (): void => this.matrix.stopLoadingHistory()

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
