import type { EventId, LocalId } from '@/shared/types/ids'
import type { ReactNode } from 'react'
import { ITEM_ID_ATTR, RECEIPT_ID_ATTR } from '../utils/domAttributes'

interface Props {
  itemId: LocalId
  /** event_id чужого сообщения, прочтение которого нужно отправить; своё не метится */
  receiptEventId?: EventId | undefined
  children: ReactNode
}

/**
 * Ряд ленты в разметке. Вешает атрибуты, по которым хуки ленты находят ряд в DOM: якорь
 * удержания позиции при догрузке истории, цель прыжка к цитате, кандидат на m.read.
 * Сами ряды (MessageRow, SystemMessage) о них не знают — зачем они нужны, знает только лента.
 */
export function TimelineRow({ itemId, receiptEventId, children }: Props) {
  return <div {...{ [ITEM_ID_ATTR]: itemId, [RECEIPT_ID_ATTR]: receiptEventId }}>{children}</div>
}
