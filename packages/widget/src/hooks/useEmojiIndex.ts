import { useSyncExternalStore } from 'react'
import type { EmojiIndex } from '../domain/emoji'
import { getEmojiIndex, subscribeEmojiIndex } from '../shared/emoji/emojiIndexStore'

/**
 * Индекс пака для рендера, `null` — пока не загружен.
 *
 * Только чтение: загрузку запускает панель (`ChatPanel`), а не компоненты текста. Иначе каждый
 * пузырь в ленте зависел бы от `ChatController`, хотя рисует он строку.
 */
export function useEmojiIndex(): EmojiIndex | null {
  return useSyncExternalStore(subscribeEmojiIndex, getEmojiIndex)
}
