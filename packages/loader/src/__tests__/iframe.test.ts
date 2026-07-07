import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IframeView } from '../iframe'
import { MOBILE_BREAKPOINT_PX } from '../viewport'

function setInnerWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
}

// jsdom не реализует VisualViewport вовсе — подкладываем минимальный дубль
// (EventTarget + height/offsetTop), которого достаточно для onVisualViewportResize.
function installFakeVisualViewport(height: number, offsetTop = 0): VisualViewport {
  const target = new EventTarget() as unknown as VisualViewport
  Object.defineProperty(target, 'height', { value: height, configurable: true })
  Object.defineProperty(target, 'offsetTop', { value: offsetTop, configurable: true })
  Object.defineProperty(window, 'visualViewport', { value: target, configurable: true })
  return target
}

beforeEach(() => {
  setInnerWidth(1440)
  // jsdom не реализует window.focus() — IframeView.open() безусловно дёргает его
  // на contentWindow; глушим, чтобы не засорять вывод теста "Not implemented" ошибкой.
  vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue(null)
})

afterEach(() => {
  document.querySelectorAll('iframe').forEach((el) => el.remove())
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  Reflect.deleteProperty(window, 'visualViewport')
  vi.restoreAllMocks()
})

describe('IframeView — mobile fullscreen placement', () => {
  it('picks docked mode on a desktop-width host', () => {
    setInnerWidth(1440)
    const view = new IframeView({ src: 'about:blank' })

    expect(view.getViewportMode()).toBe('docked')
  })

  it('picks fullscreen mode on a phone-width host', () => {
    setInnerWidth(375)
    const view = new IframeView({ src: 'about:blank' })

    expect(view.getViewportMode()).toBe('fullscreen')
  })

  it('sizes the iframe edge-to-edge (100dvh) when open in fullscreen mode', () => {
    setInnerWidth(375)
    const view = new IframeView({ src: 'about:blank' })
    view.mount()

    view.open()

    const iframe = document.querySelector('iframe')!
    expect(iframe.style.height).toBe('100dvh')
    expect(iframe.style.borderRadius).toBe('0px')
  })

  it('resets docked width to full-bleed when crossing into fullscreen while open', () => {
    setInnerWidth(1440)
    const view = new IframeView({ src: 'about:blank' })
    view.mount()
    view.open()
    expect(document.querySelector('iframe')!.style.width).toBe('444px')

    setInnerWidth(375)
    window.dispatchEvent(new Event('resize'))

    const iframe = document.querySelector('iframe')!
    expect(iframe.style.width).toBe('100%')
    expect(iframe.style.height).toBe('100dvh')
  })

  it('locks host body scroll while open in fullscreen, restores on close', () => {
    setInnerWidth(375)
    const view = new IframeView({ src: 'about:blank' })
    view.mount()

    view.open()
    expect(document.body.style.overflow).toBe('hidden')

    view.close()
    expect(document.body.style.overflow).toBe('')
  })

  it('does not lock host body scroll when docked', () => {
    setInnerWidth(1440)
    const view = new IframeView({ src: 'about:blank' })
    view.mount()

    view.open()

    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('notifies onViewportChange when a resize crosses the breakpoint', () => {
    setInnerWidth(1440)
    const onViewportChange = vi.fn()
    const view = new IframeView({ src: 'about:blank', onViewportChange })
    view.mount()

    setInnerWidth(MOBILE_BREAKPOINT_PX - 1)
    window.dispatchEvent(new Event('resize'))

    expect(onViewportChange).toHaveBeenCalledTimes(1)
    expect(onViewportChange).toHaveBeenCalledWith('fullscreen')
    expect(view.getViewportMode()).toBe('fullscreen')
  })

  it('does not notify when resize stays within the same mode', () => {
    setInnerWidth(1440)
    const onViewportChange = vi.fn()
    const view = new IframeView({ src: 'about:blank', onViewportChange })
    view.mount()

    setInnerWidth(1920)
    window.dispatchEvent(new Event('resize'))

    expect(onViewportChange).not.toHaveBeenCalled()
  })

  it('slides down on close in fullscreen, scales down when docked', () => {
    setInnerWidth(375)
    const mobile = new IframeView({ src: 'about:blank' })
    mobile.mount()
    mobile.open()
    mobile.close()
    expect(document.querySelector('iframe')!.style.transform).toBe('translateY(100%)')
  })
})

describe('IframeView — iOS scroll lock', () => {
  it('locks html overflow in addition to body, restores on close', () => {
    setInnerWidth(375)
    const view = new IframeView({ src: 'about:blank' })
    view.mount()

    view.open()
    expect(document.documentElement.style.overflow).toBe('hidden')

    view.close()
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('blocks touchmove while locked, stops blocking after close', () => {
    setInnerWidth(375)
    const view = new IframeView({ src: 'about:blank' })
    view.mount()

    view.open()
    const whileOpen = new Event('touchmove', { cancelable: true })
    document.dispatchEvent(whileOpen)
    expect(whileOpen.defaultPrevented).toBe(true)

    view.close()
    const afterClose = new Event('touchmove', { cancelable: true })
    document.dispatchEvent(afterClose)
    expect(afterClose.defaultPrevented).toBe(false)
  })
})

describe('IframeView — keyboard-aware fullscreen sizing', () => {
  it('shrinks to visualViewport height/offset when the keyboard opens', () => {
    setInnerWidth(375)
    const vv = installFakeVisualViewport(667)
    const view = new IframeView({ src: 'about:blank' })
    view.mount()
    view.open()

    Object.defineProperty(vv, 'height', { value: 320, configurable: true })
    Object.defineProperty(vv, 'offsetTop', { value: 12, configurable: true })
    vv.dispatchEvent(new Event('resize'))

    const iframe = document.querySelector('iframe')!
    expect(iframe.style.height).toBe('320px')
    expect(iframe.style.top).toBe('12px')
  })

  it('ignores visualViewport resize when docked', () => {
    setInnerWidth(1440)
    const vv = installFakeVisualViewport(900)
    const view = new IframeView({ src: 'about:blank' })
    view.mount()
    view.open()

    Object.defineProperty(vv, 'height', { value: 300, configurable: true })
    vv.dispatchEvent(new Event('resize'))

    expect(document.querySelector('iframe')!.style.height).toBe('656px')
  })

  it('ignores visualViewport resize while closed', () => {
    setInnerWidth(375)
    const vv = installFakeVisualViewport(667)
    const view = new IframeView({ src: 'about:blank' })
    view.mount()

    Object.defineProperty(vv, 'height', { value: 320, configurable: true })
    vv.dispatchEvent(new Event('resize'))

    expect(document.querySelector('iframe')!.style.height).toBe('0px')
  })
})
