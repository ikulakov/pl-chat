import { t } from '../i18n'

export function quoteAuthorLabel(
  sender: string,
  userId: string | null,
  operatorName: string,
): string {
  return sender === userId ? t('chat.reply.you') : operatorName
}
