import '@testing-library/jest-dom'

// jsdom не реализует scrollIntoView/scrollTo — нужны компонентам со скроллом к последнему сообщению
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {}
}

// jsdom не реализует IntersectionObserver — нужен MessageList для видимости кнопки "вниз".
// Управляемая заглушка: тесты дёргают trigger() на последнем инстансе, чтобы эмулировать
// пересечение сентинела без реального layout (см. useChatScroll.test.tsx).
export class FakeIntersectionObserver implements IntersectionObserver {
  static instances: FakeIntersectionObserver[] = []

  root = null
  rootMargin = ''
  scrollMargin = ''
  thresholds: ReadonlyArray<number> = []

  private readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  trigger(isIntersecting: boolean): void {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this)
  }
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver =
    FakeIntersectionObserver as unknown as typeof IntersectionObserver
}

// jsdom не реализует ResizeObserver — нужен useAutoScroll для прилипания к низу
// при изменении высоты контейнера (рост композера, мобильная клавиатура).
class FakeResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
}
