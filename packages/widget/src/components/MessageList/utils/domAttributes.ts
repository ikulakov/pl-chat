/**
 * Атрибуты разметки ряда ленты: по ним хуки ленты находят строку в DOM, не имея ссылки на
 * компонент. Вешают MessageRow и SystemMessage, читают useChatScroll, useLoadMoreHistory и
 * useSendReadReceipts.
 */

// Метка ряда ленты: якорь удержания позиции при догрузке истории и цель прокрутки к сообщению.
export const ITEM_ID_ATTR = 'data-item-id'

// Чужое сообщение, прочтение которого нужно отправить; своё не метится.
export const RECEIPT_ID_ATTR = 'data-receipt-id'
