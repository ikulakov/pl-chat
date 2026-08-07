import { useMemo } from 'react'
import { toSubmitActions, type CardAction } from '../../../domain/adaptiveCards'
import type { AdaptiveCardTimelineItem } from '../../../domain/timeline'
import { useChatActions } from '../../../hooks/useChatActions'
import { useChatStore } from '../../../hooks/useChatStore'
import { selectCardAnswers } from '../../../store/selectors'
import { CardActions } from './CardActions'

interface Props {
  item: AdaptiveCardTimelineItem
}

export function AdaptiveCardActions({ item }: Props) {
  const { sendCardAction } = useChatActions()
  const cardAnswers = useChatStore(selectCardAnswers)
  const answer = cardAnswers[item.eventId]

  // Единственное место, где карточка сужается до поддерживаемого подмножества (только кнопки).
  const actions = useMemo(() => toSubmitActions(item.content.card), [item.content.card])

  if (!actions) return null

  const handleSelect = (action: CardAction): void => {
    void sendCardAction(item.eventId, action)
  }

  return (
    <CardActions
      actions={actions}
      answer={answer}
      onSelect={handleSelect}
    />
  )
}
