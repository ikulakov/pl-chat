import { useSyncExternalStore } from 'react'
import type { EmojiCatalog } from '../domain/emoji'
import { getEmojiCatalog, subscribeEmojiCatalog } from '../shared/emoji/emojiCatalogStore'

/**
 * Каталог эмодзи для рендера, `null` — пока не загружен.
 *
 * Только чтение: загрузку запускает панель (`ChatPanel`), а не компоненты текста. Иначе каждый
 * пузырь в ленте зависел бы от `ChatController`, хотя рисует он строку.
 */
export function useEmojiCatalog(): EmojiCatalog | null {
  return useSyncExternalStore(subscribeEmojiCatalog, getEmojiCatalog)
}
