import { useMemo } from 'react'
import { emojiLayout, splitEmoji, type EmojiLayout, type EmojiSegment } from '../domain/emoji'
import { useEmojiCatalog } from './useEmojiCatalog'

/**
 * Разбор текста на сегменты и размер отрисовки. Считается один раз на текст и версию каталога:
 * до его приезда `splitEmoji` отдаёт исходную строку целиком и ничего не стоит.
 */
export function useEmojiSegments(text: string): {
  segments: EmojiSegment[]
  layout: EmojiLayout
} {
  const catalog = useEmojiCatalog()

  return useMemo(() => {
    const segments = splitEmoji(text, catalog)
    return { segments, layout: emojiLayout(segments) }
  }, [text, catalog])
}
