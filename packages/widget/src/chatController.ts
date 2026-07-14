import type { HostCommand } from '@bankchat/protocol'
import type { HostBridge } from './bridge'
import { createMatrixService } from './matrix/createMatrixService'
import type { MatrixService } from './matrix/matrixController'
import { chatStore } from './store/store'

export class ChatController {
  private readonly bridge: HostBridge
  private readonly matrix: MatrixService

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

  sendMessage = (text: string): Promise<void> => this.matrix.sendMessage(text)

  resendMessage = (localId: string): Promise<void> => this.matrix.resendMessage(localId)

  markRead = (eventId: string): Promise<void> => this.matrix.markRead(eventId)

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
