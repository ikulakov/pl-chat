import { t } from '../i18n'
import { parseMxcUrl } from '../shared/utils/mxc'
import { toStickerFormat, type StickerFormat } from './emoji'
import { isMedia, isSticker, type MessageTimelineItem } from './timeline'

/**
 * Чем показать стикер в цитате.
 *
 * Подпись стикера (`content.body`) — это эмодзи, но не обязательно эмодзи нашего пака: рядом
 * с картинками ленты оно рисуется системным шрифтом и выглядит чужеродно. Поэтому в цитате
 * показываем сам стикер, а текстом идёт подпись «Стикер».
 */
export interface ReplyStickerPreview {
  mediaId: string
  body: string
  format: StickerFormat
}

export function replyAuthorLabel(sender: string, userId: string | null): string {
  return sender === userId ? t('chat.reply.you') : t('chat.reply.operator')
}

export const replyText = (item: MessageTimelineItem): string =>
  isSticker(item)
    ? t('chat.reply.sticker')
    : item.content.body.trim() || (isMedia(item) ? item.content.filename : '')

/** `undefined` и для не-стикера, и для стикера без разбираемого `mxc:` — цитата тогда текстовая. */
export function replyStickerOf(item: MessageTimelineItem): ReplyStickerPreview | undefined {
  if (!isSticker(item)) return undefined

  const mediaId = parseMxcUrl(item.content.url)?.mediaId
  if (!mediaId) return undefined

  return {
    mediaId,
    body: item.content.body,
    format: toStickerFormat(item.content.info.mimetype),
  }
}

export const replyEventIdOf = (item: MessageTimelineItem): string | undefined =>
  item.relation?.type === 'reply' ? item.relation.eventId : undefined
