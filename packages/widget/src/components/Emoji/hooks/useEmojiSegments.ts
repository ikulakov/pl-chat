import { splitEmoji, type EmojiSegment } from '@/domain/emoji'
import { useMemo } from 'react'
import { emojiLayout, type EmojiLayout } from '../utils/emojiLayout'
import { useEmojiIndex } from './useEmojiIndex'

/**
 * Разбор текста на сегменты и размер отрисовки. Считается один раз на текст и версию пака:
 * до приезда индекса `splitEmoji` отдаёт исходную строку целиком и ничего не стоит.
 */
export function useEmojiSegments(text: string): {
  segments: EmojiSegment[]
  layout: EmojiLayout
  version: string
} {
  const index = useEmojiIndex()

  return useMemo(() => {
    const segments = splitEmoji(text, index)
    return { segments, layout: emojiLayout(segments), version: index?.version ?? '' }
  }, [text, index])
}
