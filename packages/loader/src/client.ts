import {
  isChatEvent,
  isEnvelope,
  makeEnvelope,
  type ChatEvent,
  type ChatEventType,
  type HostCommand,
  type InitConfig,
  type PayloadOf,
  type ViewportMode,
} from '@bankchat/protocol'
import { chatOrigin, validateConfig, widgetUrl, type LoaderConfig } from './config'
import { IframeView } from './iframe'

type EventHandler = (payload: unknown) => void

export class BankChatClient {
  private config: LoaderConfig | null = null
  private origin = ''
  private iframe: IframeView | null = null
  private port: MessagePort | null = null
  private ready = false
  private queue: HostCommand[] = []
  private readonly handlers = new Map<string, Set<EventHandler>>()

  init(config: LoaderConfig): void {
    if (this.config) return

    validateConfig(config)
    this.config = config
    this.origin = chatOrigin(config)

    const parentOrigin = window.location.origin
    this.iframe = new IframeView({
      src: widgetUrl(config, parentOrigin),
      onViewportChange: this.handleViewportChange,
    })
    this.iframe.mount()

    this.on('INIT_ACK', () => {
      this.ready = true
      this.flush()
    })
    this.on('OPENED', () => this.iframe?.open())
    this.on('CLOSED', () => this.iframe?.close())

    window.addEventListener('message', this.onWindowMessage)
  }

  open(): void {
    this.send({ type: 'OPEN' })
  }
  close(): void {
    this.send({ type: 'CLOSE' })
  }
  toggle(): void {
    this.send({ type: 'TOGGLE' })
  }
  private handleViewportChange = (mode: ViewportMode): void => {
    this.send({ type: 'SET_VIEWPORT', payload: { mode } })
  }

  on<E extends ChatEventType>(eventType: E, handler: (event: PayloadOf<E>) => void): () => void {
    let set = this.handlers.get(eventType)
    if (!set) {
      set = new Set()
      this.handlers.set(eventType, set)
    }
    const wrapped = handler as EventHandler
    set.add(wrapped)

    return () => set.delete(wrapped)
  }

  private onWindowMessage = (e: MessageEvent): void => {
    if (
      e.origin !== this.origin ||
      e.source !== this.iframe?.contentWindow ||
      !isEnvelope(e.data) ||
      e.data.msg.type !== 'READY'
    )
      return

    window.removeEventListener('message', this.onWindowMessage)

    const channel = new MessageChannel()
    this.port = channel.port1
    this.port.onmessage = this.onPortMessage

    const initPayload: InitConfig = { viewport: this.iframe.getViewportMode() }

    this.iframe.contentWindow?.postMessage(
      makeEnvelope<HostCommand>({ type: 'INIT', payload: initPayload }),
      this.origin,
      [channel.port2],
    )
  }

  private onPortMessage = (e: MessageEvent): void => {
    if (!isEnvelope(e.data) || !isChatEvent(e.data.msg)) return

    this.emit(e.data.msg)
  }

  private send(cmd: HostCommand): void {
    if (!this.ready || !this.port) {
      this.queue.push(cmd)
      return
    }
    this.port.postMessage(makeEnvelope(cmd))
  }

  private flush(): void {
    const q = this.queue
    this.queue = []
    q.forEach((cmd) => this.send(cmd))
  }

  private emit(event: ChatEvent): void {
    const set = this.handlers.get(event.type)
    if (!set) return
    const payload = 'payload' in event ? event.payload : undefined

    for (const handler of [...set]) {
      try {
        handler(payload)
      } catch (err) {
        console.error('[BankChat] listener error', err)
      }
    }
  }
}
