import type { StickerFormat } from './emoji'
import { isOptimistic } from './optimistic'
import { isMedia, isSticker, type MessageTimelineItem, type StickerMedia } from './timeline'

/**
 * Чем показать стикер в цитате.
 *
 * Подпись стикера (`content.body`) — это эмодзи, но не обязательно эмодзи нашего пака: рядом
 * с картинками ленты оно рисуется системным шрифтом и выглядит чужеродно. Поэтому в цитате
 * показываем сам стикер, а текстом идёт подпись «Стикер».
 */
export interface ReplyStickerPreview extends StickerMedia {
  body: string
  format: StickerFormat
}

/**
 * Что цитировать. Дескриптор, а не готовая строка: цель ответа лежит в сторе, и переведённая
 * подпись «Стикер» не пережила бы смену локали. Переводит рендер.
 */
export type ReplyQuote =
  // текст сообщения или имя файла без подписи
  | { kind: 'text'; text: string }
  // превью нет, если у стикера не разобрался mxc — тогда цитата только подписью
  | { kind: 'sticker'; preview?: ReplyStickerPreview }

export interface ReplyTarget {
  eventId: string
  sender: string
  quote: ReplyQuote
}

/** `undefined` — цитировать нечего: у сообщения нет ни текста, ни имени файла. */
export function replyQuoteOf(item: MessageTimelineItem): ReplyQuote | undefined {
  if (isSticker(item)) {
    const preview = replyStickerOf(item)
    return preview ? { kind: 'sticker', preview } : { kind: 'sticker' }
  }

  const text = item.content.body.trim() || (isMedia(item) ? item.content.filename : '')
  return text === '' ? undefined : { kind: 'text', text }
}

function replyStickerOf(item: MessageTimelineItem): ReplyStickerPreview | undefined {
  if (!isSticker(item)) return

  const { media, body, format } = item.content
  return media ? { ...media, body, format } : undefined
}

export const replyEventIdOf = (item: MessageTimelineItem): string | undefined =>
  item.relation?.type === 'reply' ? item.relation.eventId : undefined

/**
 * Цель ответа, или `undefined`, если ответить на сообщение нельзя: у черновика ещё нет события
 * на сервере, а у сообщения без текста и имени файла нечего цитировать. Один источник правды
 * для пункта меню и для свайпа.
 */
export function replyTargetOf(item: MessageTimelineItem): ReplyTarget | undefined {
  if (isOptimistic(item.eventId)) return

  const quote = replyQuoteOf(item)
  if (!quote) return

  return { eventId: item.eventId, sender: item.sender, quote }
}
