import type { ViewportMode } from '@bankchat/protocol'
import {
  resolveCollapsedStyle,
  resolveContainerStyle,
  type PanelAppearance,
} from './panel/appearance'
import { HostScrollLock } from './panel/hostScrollLock'
import { MOBILE_MEDIA_QUERY, resolveViewportMode } from './panel/viewport'
import { schedulePreload, type PreloadMode } from './preload'

interface IframeViewOptions {
  /** URL документа виджета (с parentOrigin для READY-beacon). */
  src: string
  /** Момент загрузки бандла виджета. По умолчанию `idle`. */
  preload?: PreloadMode
  /** Колбэк смены docked/fullscreen при пересечении брейкпоинта ширины хоста. */
  onViewportChange?: (mode: ViewportMode) => void
  /** Позиция/z-index/произвольные стили контейнера — управляются хостом. */
  appearance?: PanelAppearance
}

export class IframeView {
  private iframe: HTMLIFrameElement | null = null
  private isOpen = false
  private readonly mobileQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
  private mode: ViewportMode = resolveViewportMode(this.mobileQuery.matches)
  private readonly scrollLock = new HostScrollLock()
  private appearance: PanelAppearance
  private srcAssigned = false

  constructor(private readonly options: IframeViewOptions) {
    this.appearance = options.appearance ?? {}
  }

  get contentWindow(): Window | null {
    return this.iframe?.contentWindow ?? null
  }

  mount(): void {
    if (this.iframe) return

    const iframe = document.createElement('iframe')
    iframe.id = 'plchat-frame'
    // src ставит load() — момент выбирает режим preload (см. schedulePreload).
    iframe.title = 'PL chat'
    iframe.allow = 'clipboard-write'
    iframe.tabIndex = -1
    Object.assign(iframe.style, resolveCollapsedStyle(this.mode, this.appearance))
    document.body.appendChild(iframe)
    this.iframe = iframe

    this.mobileQuery.addEventListener('change', this.onViewportModeChange)
    schedulePreload(this.options.preload ?? 'idle', () => this.load())
  }

  /**
   * Ставит `src`, если он ещё не поставлен. Идемпотентность здесь несущая: на ней
   * держится и ранний вызов из open() (отложенный прогрев после него выйдет вхолостую),
   * и запрет повторной навигации фрейма — она убила бы уже поднятый MessagePort.
   */
  load(): void {
    if (this.srcAssigned || !this.iframe) return

    this.srcAssigned = true
    this.iframe.src = this.options.src
  }

  // open()/close() приходят из двух мест — команды хоста и подтверждения OPENED/CLOSED
  // от виджета, — поэтому выходим рано на повторе: иначе лишний render и, что заметнее,
  // перевод фокуса в уже открытый iframe.
  open(): void {
    if (this.isOpen) return

    // Пользователь нажал раньше, чем виджет прогрелся, — откладывать больше нечего.
    this.load()
    this.isOpen = true
    if (this.iframe) this.iframe.tabIndex = 0
    this.render()
    this.iframe?.contentWindow?.focus()
  }

  close(): void {
    if (!this.isOpen) return

    this.isOpen = false
    if (this.iframe) this.iframe.tabIndex = -1
    this.render()
  }

  toggle(): void {
    if (this.isOpen) this.close()
    else this.open()
  }

  getViewportMode(): ViewportMode {
    return this.mode
  }

  setAppearance(appearance: PanelAppearance): void {
    this.appearance = appearance
    this.render()
  }

  private onViewportModeChange = (): void => {
    const next = resolveViewportMode(this.mobileQuery.matches)
    if (next === this.mode) return

    this.mode = next
    this.options.onViewportChange?.(next)
    if (this.isOpen) this.render()
  }

  private render(): void {
    if (!this.iframe) return
    this.iframe.style.cssText = ''

    if (!this.isOpen) {
      this.scrollLock.unlock()
      Object.assign(this.iframe.style, resolveCollapsedStyle(this.mode, this.appearance))
      return
    }

    Object.assign(this.iframe.style, {
      ...resolveContainerStyle(this.mode, this.appearance),
      opacity: '1',
      pointerEvents: 'auto',
      transform: 'none',
    })

    if (this.mode === 'fullscreen') this.scrollLock.lock()
    else this.scrollLock.unlock()
  }
}
