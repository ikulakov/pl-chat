import type { HostCommand } from '@bankchat/protocol'
import type { HostBridge } from './bridge'
import { matrixApi } from './matrix/matrixApi'
import { MatrixController, type MatrixSession } from './matrix/matrixController'
import { chatStore } from './store/store'

export class ChatController {
  private readonly bridge: HostBridge
  private readonly matrix: MatrixSession

  constructor(bridge: HostBridge, matrix?: MatrixSession) {
    this.bridge = bridge
    this.bridge.setCommandHandler(this.handleHostCommand)

    this.matrix =
      matrix ??
      new MatrixController({
        api: matrixApi,
        dispatch: (action) => chatStore.getState().dispatch(action),
        getState: chatStore.getState,
      })
  }

  handleHostCommand = (cmd: HostCommand): void => {
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
        break
    }
  }

  sendMessage = (text: string): Promise<void> => this.matrix.sendMessage(text)

  retry = (): void => {
    void this.matrix.connect()
  }

  destroy(): void {
    this.matrix.disconnect()
  }

  private open(): void {
    if (chatStore.getState().isOpen) return

    chatStore.getState().openPanel()
    this.bridge.send({ type: 'OPENED' })
    void this.matrix.connect()
  }

  private close(): void {
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
