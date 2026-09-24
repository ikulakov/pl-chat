import { replyEventIdOf, replyQuoteOf, type ReplyTarget } from '@/domain/reply'
import type { MessageTimelineItem } from '@/domain/timeline'
import { t } from '@/i18n'
import type { UserId } from '@/shared/types/ids'
import type { ReplyPreviewData } from '../types'

/** Что цитируем и чьё это: цель ответа из композера целиком или родитель из ленты. */
type QuoteSource = Pick<ReplyTarget, 'sender' | 'quote'>

/** Цитата для `ReplyPreview`. Стикер подписывается «Стикер», а не своим эмодзи. */
export function getReplyQuotePreview(
  { sender, quote }: QuoteSource,
  userId: UserId | null,
): ReplyPreviewData {
  const author = sender === userId ? t('chat.reply.you') : t('chat.reply.operator')
  if (quote.kind === 'text') return { author, text: quote.text }

  const text = t('chat.reply.sticker')
  return quote.preview ? { author, text, sticker: quote.preview } : { author, text }
}

interface GetMessageReplyPreviewParams {
  parent: MessageTimelineItem | undefined
  message: MessageTimelineItem
  userId: UserId
}

export function getMessageReplyPreview({
  parent,
  message,
  userId,
}: GetMessageReplyPreviewParams): ReplyPreviewData | undefined {
  // Отсутствие parent ещё не означает недоступную цитату: сообщение может быть без ответа.
  if (!replyEventIdOf(message)) return

  const quote = parent ? replyQuoteOf(parent) : undefined

  // нечего показать (отредактированное/вычищенное сообщение) — то же, что не загруженное
  if (!parent || !quote) {
    return { text: t('chat.reply.unavailable') }
  }

  return {
    ...getReplyQuotePreview({ sender: parent.sender, quote }, userId),
    targetId: parent.localId,
  }
}
