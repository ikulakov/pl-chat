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

// jsdom не реализует object-URL — на них живут превью вложений (картинка в композере).
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:test'
  URL.revokeObjectURL = () => {}
}

// jsdom не рисует в canvas (getContext отдаёт null), а lottie-web трогает 2d-контекст прямо
// при импорте модуля — без заглушки падает сбор любого теста, который тянет рендер эмодзи.
// Заглушка молча глотает вызовы: проверять нечего, а сама отрисовка в тестах мокается.
HTMLCanvasElement.prototype.getContext = (() =>
  new Proxy({} as Record<string, unknown>, {
    get: (target, prop) => target[prop as string] ?? (() => {}),
    set: (target, prop, value) => {
      target[prop as string] = value
      return true
    },
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext

HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,test'

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
