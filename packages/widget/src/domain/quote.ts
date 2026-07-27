import { t } from '../i18n'

export function quoteAuthorLabel(sender: string, userId: string | null): string {
  return sender === userId ? t('chat.reply.you') : t('chat.reply.operator')
}
