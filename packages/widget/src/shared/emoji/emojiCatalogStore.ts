import type { EmojiCatalog } from '../../domain/emoji'

/**
 * Каталог эмодзи для рендера — крошечный внешний стор под `useSyncExternalStore`.
 *
 * В `chatStore` он не идёт: это не состояние диалога, оно не участвует в редьюсере и не
 * переживает ничего, что редьюсер отслеживает. Пока каталог не приехал, снапшот `null` — текст
 * рисуется системным шрифтом, как и раньше.
 */

type Listener = () => void

const listeners = new Set<Listener>()
let catalog: EmojiCatalog | null = null
let loading: Promise<void> | null = null

export function subscribeEmojiCatalog(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getEmojiCatalog(): EmojiCatalog | null {
  return catalog
}

/** Грузит каталог один раз за жизнь вкладки. Повторные вызовы (ремаунт панели) бесплатны. */
export function ensureEmojiCatalog(load: () => Promise<EmojiCatalog>): void {
  if (catalog || loading) return

  loading = load()
    .then((loaded) => {
      catalog = loaded
      listeners.forEach((listener) => listener())
    })
    .catch((err: unknown) => {
      // Каталога нет — эмодзи останутся юникодом, чат работает. Ошибку показывать не за что.
      console.error('[PLChat] emoji catalog failed:', err)
    })
    .finally(() => {
      loading = null
    })
}

/** Нужен тестам: стор — модульный синглтон. */
export function resetEmojiCatalog(): void {
  catalog = null
  loading = null
  listeners.clear()
}
