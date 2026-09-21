import type { UserId } from '@/shared/types/ids'
import type { ReplyQuote, ReplyStickerPreview } from '@/domain/reply'
import { t } from '@/i18n'

export function replyAuthorLabel(sender: UserId, userId: UserId | null): string {
  return sender === userId ? t('chat.reply.you') : t('chat.reply.operator')
}

interface ReplyQuoteView {
  text: string
  sticker?: ReplyStickerPreview
}

/** Цитата для `ReplyPreview`. Стикер подписывается «Стикер», а не своим эмодзи. */
export function replyQuoteView(quote: ReplyQuote): ReplyQuoteView {
  if (quote.kind === 'text') return { text: quote.text }

  const text = t('chat.reply.sticker')
  return quote.preview ? { text, sticker: quote.preview } : { text }
}
