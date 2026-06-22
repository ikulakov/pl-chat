import type { HostCommand } from '@bankchat/protocol'
import { hostBridge } from '../bridge'

type Listener = () => void

export interface ChatState {
  isOpen: boolean
}

const initialState: ChatState = { isOpen: false }

export class ChatStore {
  private state: ChatState = initialState
  private readonly listeners = new Set<Listener>()

  handleCommand(cmd: HostCommand): void {
    switch (cmd.type) {
      case 'OPEN':
        if (!this.state.isOpen) {
          this.setState({ isOpen: true })
          hostBridge.send({ type: 'OPENED' })
        }
        break
      case 'CLOSE':
        if (this.state.isOpen) {
          this.setState({ isOpen: false })
          hostBridge.send({ type: 'CLOSED' })
        }
        break
      case 'TOGGLE':
        this.handleCommand(this.state.isOpen ? { type: 'CLOSE' } : { type: 'OPEN' })
        break
      case 'INIT':
        break
    }
  }

  closePanel = (): void => {
    this.handleCommand({ type: 'CLOSE' })
  }

  private setState(patch: Partial<ChatState>): void {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = (): ChatState => this.state
}

export const chatStore = new ChatStore()
