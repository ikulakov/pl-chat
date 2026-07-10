import type { ViewportMode } from '@bankchat/protocol'
import {
  BASE_STYLE,
  COLLAPSED_STYLE,
  DOCKED_STYLE,
  FULLSCREEN_STYLE,
  TRANSITION_STYLE,
  type Style,
} from './iframeStyles'
import { HostScrollLock } from './hostScrollLock'
import { resolveViewportMode } from './viewport'

interface IframeViewOptions {
  /** URL документа виджета (с parentOrigin для READY-beacon). */
  src: string
  /** Колбэк смены docked/fullscreen при пересечении брейкпоинта ширины хоста. */
  onViewportChange?: (mode: ViewportMode) => void
}

export class IframeView {
  private iframe: HTMLIFrameElement | null = null
  private isOpen = false
  private mode: ViewportMode = resolveViewportMode(window.innerWidth)
  private readonly scrollLock = new HostScrollLock()

  constructor(private readonly options: IframeViewOptions) {}

  get contentWindow(): Window | null {
    return this.iframe?.contentWindow ?? null
  }

  mount(): void {
    if (this.iframe) return

    const iframe = document.createElement('iframe')
    iframe.src = this.options.src
    iframe.title = 'Bank chat'
    iframe.allow = 'clipboard-write'
    iframe.tabIndex = -1
    Object.assign(iframe.style, BASE_STYLE, COLLAPSED_STYLE, TRANSITION_STYLE)
    document.body.appendChild(iframe)
    this.iframe = iframe

    window.addEventListener('resize', this.onResize)
    window.visualViewport?.addEventListener('resize', this.onVisualViewportResize)
  }

  open(): void {
    this.isOpen = true
    if (this.iframe) this.iframe.tabIndex = 0
    this.render()
    this.iframe?.contentWindow?.focus()
  }

  close(): void {
    this.isOpen = false
    if (this.iframe) this.iframe.tabIndex = -1
    this.render()
  }

  getViewportMode(): ViewportMode {
    return this.mode
  }

  private onResize = (): void => {
    const next = resolveViewportMode(window.innerWidth)
    if (next === this.mode) return

    this.mode = next
    this.options.onViewportChange?.(next)
    if (this.isOpen) this.render()
  }

  private onVisualViewportResize = (): void => {
    if (!this.isOpen || !this.iframe || this.mode !== 'fullscreen') return

    const vv = window.visualViewport
    if (!vv) return

    this.iframe.style.height = `${vv.height}px`
    this.iframe.style.top = `${vv.offsetTop}px`
  }

  private render(): void {
    if (!this.iframe) return
    if (!this.isOpen) {
      this.scrollLock.unlock()
      Object.assign(this.iframe.style, {
        ...COLLAPSED_STYLE,
        transform: this.mode === 'fullscreen' ? 'translateY(100%)' : 'scale(0.95)',
      } as Style)
      return
    }

    const placement = this.mode === 'fullscreen' ? FULLSCREEN_STYLE : DOCKED_STYLE
    Object.assign(this.iframe.style, {
      ...placement,
      opacity: '1',
      pointerEvents: 'auto',
      transform: 'none',
    } as Style)

    if (this.mode === 'fullscreen') this.scrollLock.lock()
    else this.scrollLock.unlock()
  }
}
