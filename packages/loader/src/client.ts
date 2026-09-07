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
import type { PanelAppearance } from './panel/appearance'

type EventHandler = (payload: unknown) => void

export class BankChatClient {
  private config: LoaderConfig | null = null
  private origin = ''
  private iframe: IframeView | null = null
  private port: MessagePort | null = null
  private ready = false
  private pendingOpen = false
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
      ...(config.appearance !== undefined && { appearance: config.appearance }),
      ...(config.preload !== undefined && { preload: config.preload }),
    })
    this.iframe.mount()

    this.on('INIT_ACK', () => {
      this.ready = true
      this.flush()
      // Одна команда по последнему намерению, а не проигрывание накопленных в очереди OPEN/CLOSE.
      if (this.pendingOpen) this.open()
    })
    this.on('OPENED', () => this.iframe?.open())
    this.on('CLOSED', () => this.iframe?.close())

    window.addEventListener('message', this.onWindowMessage)
  }

  // Рамку разворачиваем в тот же тик, что и отправку команды: если ждать ответного
  // OPENED, виджет успеет отрисовать панель, пока бокс iframe ещё нулевой (свёрнутая
  // рамка — 0×0), и его ResizeObserver/IntersectionObserver посчитают геометрию по
  // пустому боксу. До готовности рамку, наоборот, не трогаем: бандла ещё нет, и
  // развёрнутый бокс был бы пустым белым прямоугольником.
  //
  // Команды панели, в отличие от остальных, не буферизуются — хранится только
  // последнее намерение. Иначе «открыл и передумал» проигрывался бы логом: виджет на
  // OPEN разворачивает панель, забирает фокус и поднимает Matrix-сессию (register +
  // sync) ради диалога, от которого пользователь уже отказался.
  open(): void {
    // Намерение открыть — это и есть сигнал качать бандл: при preload='on-open' его ещё нет.
    this.iframe?.load()
    if (!this.ready) {
      this.pendingOpen = true
      return
    }

    this.pendingOpen = false
    this.iframe?.open()
    this.send({ type: 'OPEN' })
  }
  close(): void {
    this.pendingOpen = false
    if (!this.ready) return

    this.iframe?.close()
    this.send({ type: 'CLOSE' })
  }
  toggle(): void {
    if (!this.ready) {
      if (this.pendingOpen) this.close()
      else this.open()
      return
    }

    this.iframe?.toggle()
    this.send({ type: 'TOGGLE' })
  }
  setAppearance(appearance: PanelAppearance): void {
    if (!this.config || !this.iframe) {
      console.warn('[BankChat] setAppearance before init() — ignored')
      return
    }

    const merged: PanelAppearance = { ...this.config.appearance, ...appearance }
    this.config = { ...this.config, appearance: merged }
    this.iframe.setAppearance(merged)
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
