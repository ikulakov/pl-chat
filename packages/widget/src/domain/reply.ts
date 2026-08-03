import { t } from '../i18n'
import { isMedia, type MessageTimelineItem } from './timeline'

export function replyAuthorLabel(sender: string, userId: string | null): string {
  return sender === userId ? t('chat.reply.you') : t('chat.reply.operator')
}

export const replyText = (item: MessageTimelineItem): string =>
  item.content.body.trim() || (isMedia(item) ? item.content.filename : '')

export const replyEventIdOf = (item: MessageTimelineItem): string | undefined =>
  item.relation?.type === 'reply' ? item.relation.eventId : undefined
