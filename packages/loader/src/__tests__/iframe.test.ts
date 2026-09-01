import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IframeView } from '../iframe'

// jsdom не реализует matchMedia — подкладываем управляемый дубль: `matches`
// читается геттером, а emitMobileChange меняет его и шлёт 'change' (как реальный
// MediaQueryList при пересечении брейкпоинта).
let mobileMatches = false
let mobileQuery: EventTarget

function setMobile(matches: boolean): void {
  mobileMatches = matches
}

function emitMobileChange(matches: boolean): void {
  mobileMatches = matches
  mobileQuery.dispatchEvent(new Event('change'))
}

// HostScrollLock вешает touchmove-листенер на document; вьюшки, открытые в
// fullscreen и не закрытые явно, оставляют его между тестами. Трекаем и закрываем
// все созданные вьюшки в afterEach — close() снимает lock (и листенер).
const views: IframeView[] = []

function createView(options: ConstructorParameters<typeof IframeView>[0]): IframeView {
  const view = new IframeView(options)
  views.push(view)
  return view
}

beforeEach(() => {
  mobileMatches = false
  mobileQuery = new EventTarget()
  Object.defineProperty(mobileQuery, 'matches', { get: () => mobileMatches, configurable: true })
  window.matchMedia = vi
    .fn()
    .mockReturnValue(
      mobileQuery as unknown as MediaQueryList,
    ) as unknown as typeof window.matchMedia
  // jsdom не реализует window.focus() — IframeView.open() безусловно дёргает его
  // на contentWindow; глушим, чтобы не засорять вывод теста "Not implemented" ошибкой.
  vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue(null)
})

afterEach(() => {
  views.forEach((view) => view.close())
  views.length = 0
  document.querySelectorAll('iframe').forEach((el) => el.remove())
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  vi.restoreAllMocks()
})

describe('IframeView — mobile fullscreen placement', () => {
  it('picks docked mode on a desktop-width host', () => {
    setMobile(false)
    const view = createView({ src: 'about:blank' })

    expect(view.getViewportMode()).toBe('docked')
  })

  it('picks fullscreen mode on a phone-width host', () => {
    setMobile(true)
    const view = createView({ src: 'about:blank' })

    expect(view.getViewportMode()).toBe('fullscreen')
  })

  it('sizes the iframe edge-to-edge (100dvh) when open in fullscreen mode', () => {
    setMobile(true)
    const view = createView({ src: 'about:blank' })
    view.mount()

    view.open()

    const iframe = document.querySelector('iframe')!
    expect(iframe.style.height).toBe('100dvh')
    expect(iframe.style.borderRadius).toBe('0px')
  })

  it('resets docked width to full-bleed when crossing into fullscreen while open', () => {
    setMobile(false)
    const view = createView({ src: 'about:blank' })
    view.mount()
    view.open()
    expect(document.querySelector('iframe')!.style.width).toBe('444px')

    emitMobileChange(true)

    const iframe = document.querySelector('iframe')!
    expect(iframe.style.width).toBe('100%')
    expect(iframe.style.height).toBe('100dvh')
  })

  it('locks host body scroll while open in fullscreen, restores on close', () => {
    setMobile(true)
    const view = createView({ src: 'about:blank' })
    view.mount()

    view.open()
    expect(document.body.style.overflow).toBe('hidden')

    view.close()
    expect(document.body.style.overflow).toBe('')
  })

  it('does not lock host body scroll when docked', () => {
    setMobile(false)
    const view = createView({ src: 'about:blank' })
    view.mount()

    view.open()

    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('notifies onViewportChange when the media query crosses the breakpoint', () => {
    setMobile(false)
    const onViewportChange = vi.fn()
    const view = createView({ src: 'about:blank', onViewportChange })
    view.mount()

    emitMobileChange(true)

    expect(onViewportChange).toHaveBeenCalledTimes(1)
    expect(onViewportChange).toHaveBeenCalledWith('fullscreen')
    expect(view.getViewportMode()).toBe('fullscreen')
  })

  it('does not notify when a change event keeps the same mode', () => {
    setMobile(false)
    const onViewportChange = vi.fn()
    const view = createView({ src: 'about:blank', onViewportChange })
    view.mount()

    emitMobileChange(false)

    expect(onViewportChange).not.toHaveBeenCalled()
  })

  it('opens/closes instantly in fullscreen (no animation), scales when docked', () => {
    setMobile(true)
    const mobile = createView({ src: 'about:blank' })
    mobile.mount()
    mobile.open()
    mobile.close()
    const iframe = document.querySelector('iframe')!
    expect(iframe.style.transform).toBe('none')
    expect(iframe.style.transition).toBe('none')
  })

  it('scales down on close when docked', () => {
    setMobile(false)
    const view = createView({ src: 'about:blank' })
    view.mount()
    view.open()
    view.close()
    expect(document.querySelector('iframe')!.style.transform).toBe('scale(0.95)')
  })
})

describe('IframeView — iOS scroll lock', () => {
  it('locks html overflow in addition to body, restores on close', () => {
    setMobile(true)
    const view = createView({ src: 'about:blank' })
    view.mount()

    view.open()
    expect(document.documentElement.style.overflow).toBe('hidden')

    view.close()
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('blocks touchmove while locked, stops blocking after close', () => {
    setMobile(true)
    const view = createView({ src: 'about:blank' })
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

describe('IframeView.setAppearance — рантайм-смена позиции', () => {
  it('repositions an already open panel', () => {
    setMobile(false)
    const view = createView({ src: 'about:blank', appearance: { offsetY: 80 } })
    view.mount()
    view.open()
    expect(document.querySelector('iframe')!.style.inset).toBe('auto 17px 80px auto')

    view.setAppearance({ offsetY: 160, corner: 'bottom-left' })

    expect(document.querySelector('iframe')!.style.inset).toBe('auto auto 160px 17px')
  })

  it('keeps the collapsed box anchored to the new corner while closed', () => {
    setMobile(false)
    const view = createView({ src: 'about:blank' })
    view.mount()

    view.setAppearance({ corner: 'bottom-left' })

    expect(document.querySelector('iframe')!.style.inset).toBe('auto auto 0px 0px')
  })

  // Наборы свойств у состояний не совпадают: раскрытая docked-панель пишет
  // borderRadius/boxShadow, свёрнутая — нет. Без сброса cssText они бы на ней оседали.
  it('leaves no styles from the previous state when collapsing', () => {
    setMobile(false)
    const view = createView({ src: 'about:blank' })
    view.mount()
    const iframe = document.querySelector('iframe')!
    const freshCollapsed = iframe.style.cssText

    view.open()
    view.close()

    expect(iframe.style.cssText).toBe(freshCollapsed)
  })
})
