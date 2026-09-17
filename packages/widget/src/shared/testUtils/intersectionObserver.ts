// jsdom не реализует IntersectionObserver — нужен MessageList для видимости кнопки "вниз".
// Управляемая заглушка: тесты дёргают trigger() на последнем инстансе, чтобы эмулировать
// пересечение без реального layout. Аргумент нужен там, где компонент читает
// isIntersecting (AnimatedEmoji, EmojiPickerButton); useChatScroll его игнорирует —
// он считает положение по геометрии контейнера, и там trigger() зовут без аргумента.
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

  trigger(isIntersecting = false): void {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this)
  }
}
