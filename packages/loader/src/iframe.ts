type Style = Partial<CSSStyleDeclaration>

const BASE_STYLE: Style = {
  position: 'fixed',
  border: '0',
  zIndex: '2147483000',
  colorScheme: 'normal',
}

const TRANSITION_STYLE: Style = {
  transition: 'opacity 0.25s ease, transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
}

const COLLAPSED_STYLE: Style = {
  inset: 'auto 0 0 auto',
  width: '0',
  height: '0',
  opacity: '0',
  pointerEvents: 'none',
}

export class IframeView {
  private iframe: HTMLIFrameElement | null = null
  private isOpen = false

  constructor(private readonly src: string) {}

  get contentWindow(): Window | null {
    return this.iframe?.contentWindow ?? null
  }

  mount(): void {
    if (this.iframe) return

    const iframe = document.createElement('iframe')
    iframe.src = this.src
    iframe.title = 'Bank chat'
    iframe.allow = 'clipboard-write'
    iframe.tabIndex = -1
    Object.assign(iframe.style, BASE_STYLE, COLLAPSED_STYLE, TRANSITION_STYLE)
    document.body.appendChild(iframe)
    this.iframe = iframe
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

  private render(): void {
    if (!this.iframe) return
    if (!this.isOpen) {
      Object.assign(this.iframe.style, {
        ...COLLAPSED_STYLE,
        transform: 'scale(0.95)',
      } as Style)
      return
    }
    Object.assign(this.iframe.style, {
      inset: 'auto 17px 80px auto',
      width: '444px',
      height: '656px',
      opacity: '1',
      pointerEvents: 'auto',
      borderRadius: '20px',
      boxShadow: '0px 0px 56px 0px rgba(0,0,0,0.1)',
      transform: 'none',
    } as Style)
  }
}
