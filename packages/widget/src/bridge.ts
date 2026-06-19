import {
  isEnvelope,
  isHostCommand,
  makeEnvelope,
  withinSizeLimit,
  type ChatEvent,
  type HostCommand,
} from '@bankchat/protocol'

type CommandHandler = (cmd: HostCommand) => void

class HostBridge {
  private readonly allowedParents: string[] = (
    import.meta.env.VITE_ALLOWED_PARENTS ?? 'http://localhost:5173'
  )
    .split(',')
    .map((s: string) => s.trim())
  private port: MessagePort | null = null
  private handler: CommandHandler | null = null

  constructor() {
    window.addEventListener('message', this.onWindowMessage)
    this.sendReady()
  }

  connect(handler: CommandHandler): void {
    this.handler = handler
  }

  send(event: ChatEvent): void {
    this.port?.postMessage(makeEnvelope(event))
  }

  private sendReady(): void {
    const parentOrigin = new URLSearchParams(window.location.search).get('parentOrigin')
    if (!parentOrigin) {
      console.warn(
        '[BankChat] parentOrigin missing — widget must be loaded inside an iframe via loader.js',
      )
      return
    }
    if (!this.isAllowedOrigin(parentOrigin)) {
      console.error(
        `[BankChat] parentOrigin "${parentOrigin}" is not in ALLOWED_PARENTS — widget will not initialize. Check the environment variable.`,
      )
      return
    }
    window.parent.postMessage(makeEnvelope<ChatEvent>({ type: 'READY' }), parentOrigin)
  }

  private isAllowedOrigin(origin: string): boolean {
    return this.allowedParents.includes(origin)
  }

  private onWindowMessage = (e: MessageEvent): void => {
    if (!this.isAllowedOrigin(e.origin) || !isEnvelope(e.data) || !withinSizeLimit(e.data.msg))
      return

    const msg = e.data.msg
    if (msg['type'] !== 'INIT') return

    const port = e.ports[0]
    if (!port) return

    window.removeEventListener('message', this.onWindowMessage)

    this.port = port
    this.port.onmessage = this.onPortMessage

    this.handler?.(msg as HostCommand)
    this.send({ type: 'INIT_ACK' })
  }

  private onPortMessage = (e: MessageEvent): void => {
    if (!isEnvelope(e.data) || !isHostCommand(e.data.msg)) return

    this.handler?.(e.data.msg)
  }
}

export const hostBridge = new HostBridge()
