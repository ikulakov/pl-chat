import type { EmojiIndex } from '../../domain/emoji'
import { readCachedEmojiIndex, writeCachedEmojiIndex } from './emojiCatalogCache'
import { syncPackVersion } from './emojiDb'

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

/**
 * Грузит индекс один раз за жизнь вкладки. Повторные вызовы (ремаунт панели) бесплатны.
 *
 * Сначала из IndexedDB — лента начинает рисовать картинки, не дожидаясь сети (а на медленном
 * канале это разница между «эмодзи появились сразу» и «сначала системные глифы, потом подмена»).
 * Затем всё равно идём на сервер: только его ответ говорит, не сменилась ли версия пака.
 */
export function ensureEmojiIndex(load: () => Promise<EmojiIndex>): void {
  if (index || loading) return

  loading = readCachedEmojiIndex()
    .then((cached) => {
      if (cached && !index) publish(cached)
    })
    .then(load)
    .then((loaded) => {
      syncPackVersion(loaded.version)
      writeCachedEmojiIndex(loaded)
      publish(loaded)
    })
    .catch((err: unknown) => {
      // Индекса нет — эмодзи останутся юникодом (или тем, что нашлось в кэше), чат работает.
      console.error('[PLChat] emoji index failed:', err)
    })
    .finally(() => {
      loading = null
    })
}

function publish(loaded: EmojiIndex): void {
  index = loaded
  listeners.forEach((listener) => listener())
}

/** Нужен тестам: стор — модульный синглтон. */
export function resetEmojiIndex(): void {
  index = null
  loading = null
  listeners.clear()
}
