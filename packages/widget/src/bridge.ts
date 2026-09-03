import {
  isEnvelope,
  isHostCommand,
  makeEnvelope,
  withinSizeLimit,
  type ChatEvent,
  type HostCommand,
} from '@bankchat/protocol'

type CommandHandler = (cmd: HostCommand) => void

const DEV_PARENT_ORIGIN = 'http://localhost:5173'

// То же правило — в `frame-ancestors` (docker/nginx/default.conf.template), менять вместе.
const ALLOWED_PARENT_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*otpbank\.ru$/

/**
 * Можно ли доверять этому origin'у как хосту виджета.
 */
export function isAllowedParentOrigin(origin: string): boolean {
  return ALLOWED_PARENT_ORIGIN.test(origin) || (import.meta.env.DEV && origin === DEV_PARENT_ORIGIN)
}

export interface HostBridge {
  setCommandHandler(handler: CommandHandler): void
  send(event: ChatEvent): void
}

export class IframeBridge implements HostBridge {
  private port: MessagePort | null = null
  private handler: CommandHandler | null = null

  constructor() {
    window.addEventListener('message', this.onWindowMessage)
    this.sendReady()
  }

  setCommandHandler(handler: CommandHandler): void {
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
    if (!isAllowedParentOrigin(parentOrigin)) {
      console.error(
        `[BankChat] parentOrigin "${parentOrigin}" is not an allowed host — widget will not initialize.`,
      )
      return
    }
    window.parent.postMessage(makeEnvelope<ChatEvent>({ type: 'READY' }), parentOrigin)
  }

  private onWindowMessage = (e: MessageEvent): void => {
    if (!isAllowedParentOrigin(e.origin) || !isEnvelope(e.data) || !withinSizeLimit(e.data.msg))
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
