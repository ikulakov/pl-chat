import type { EmojiIndex } from '../../domain/emoji'

/**
 * Индекс пака для рендера — крошечный внешний стор под `useSyncExternalStore`.
 *
 * В `chatStore` он не идёт: это не состояние диалога, оно не участвует в редьюсере и не
 * переживает ничего, что редьюсер отслеживает. Пока индекс не приехал, снапшот `null` — текст
 * рисуется системным шрифтом, как и раньше.
 */

type Listener = () => void

const listeners = new Set<Listener>()
let index: EmojiIndex | null = null
let loading: Promise<void> | null = null

export function subscribeEmojiIndex(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getEmojiIndex(): EmojiIndex | null {
  return index
}

/** Грузит индекс один раз за жизнь вкладки. Повторные вызовы (ремаунт панели) бесплатны. */
export function ensureEmojiIndex(load: () => Promise<EmojiIndex>): void {
  if (index || loading) return

  loading = load()
    .then((loaded) => {
      index = loaded
      listeners.forEach((listener) => listener())
    })
    .catch((err: unknown) => {
      // Индекса нет — эмодзи останутся юникодом, чат работает. Показывать тут нечего.
      console.error('[PLChat] emoji index failed:', err)
    })
    .finally(() => {
      loading = null
    })
}

/** Нужен тестам: стор — модульный синглтон. */
export function resetEmojiIndex(): void {
  index = null
  loading = null
  listeners.clear()
}
