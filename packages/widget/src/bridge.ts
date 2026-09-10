import {
  isEnvelope,
  isHostCommand,
  makeEnvelope,
  withinSizeLimit,
  type ChatEvent,
  type HostCommand,
} from '@bankchat/protocol'
import { consoleDev } from './shared/utils/consoleDev'

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
  private readonly parentOrigin: string | null
  private port: MessagePort | null = null
  private handler: CommandHandler | null = null

  constructor() {
    const parentOrigin = new URLSearchParams(window.location.search).get('parentOrigin')
    if (!parentOrigin || !isAllowedParentOrigin(parentOrigin)) {
      this.parentOrigin = null
      consoleDev.warn('parentOrigin missing or not allowed — widget will not initialize')
      return
    }

    this.parentOrigin = parentOrigin
    window.addEventListener('message', this.onWindowMessage)
    window.parent.postMessage(makeEnvelope<ChatEvent>({ type: 'READY' }), parentOrigin)
  }

  setCommandHandler(handler: CommandHandler): void {
    this.handler = handler
  }

  send(event: ChatEvent): void {
    this.port?.postMessage(makeEnvelope(event))
  }

  private onWindowMessage = (e: MessageEvent): void => {
    if (
      e.source !== window.parent ||
      e.origin !== this.parentOrigin ||
      !isEnvelope(e.data) ||
      !withinSizeLimit(e.data.msg)
    )
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
