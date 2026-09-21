import type { EmojiSegment } from '@/domain/emoji'

/** Размер отрисовки: `big` и `mid` — для сообщений из одних эмодзи, `inline` — со строку. */
export type EmojiLayout = 'big' | 'mid' | 'inline'

// Сколько эмодзи в сообщении без текста ещё рисуются крупно.
const MAX_LARGE_EMOJI = 3

/**
 * Размер отрисовки по составу сообщения: одно эмодзи без текста — большое, два-три — средние,
 * всё остальное — строчный размер.
 */
export function emojiLayout(segments: EmojiSegment[]): EmojiLayout {
  let count = 0

  for (const segment of segments) {
    if (segment.kind === 'emoji') {
      count += 1
      continue
    }
    // Пробелы и переносы между эмодзи не делают сообщение текстовым.
    if (segment.text.trim() !== '') return 'inline'
  }

  if (count === 1) return 'big'
  if (count > 1 && count <= MAX_LARGE_EMOJI) return 'mid'

  return 'inline'
}
