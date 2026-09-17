import type { CardAnswer } from '@/domain/adaptiveCards'
import type * as Matrix from '../wire'
import { MsgType } from '../wire/consts'
import { isRoomMessage } from '../wire/guards'

export function toCardAnswer(event: Matrix.ClientEvent): CardAnswer | undefined {
  if (!isRoomMessage(event) || event.content.msgtype !== MsgType.AdaptiveAction) return

  const { source_event_id: cardEventId, action_id: actionId } = event.content.adaptive_action

  if (!cardEventId || !actionId) return undefined

  return { cardEventId, actionId, status: 'sent' }
}

export function collectCardAnswers(events: Matrix.ClientEvent[] = []): CardAnswer[] {
  const result: CardAnswer[] = []

  for (const event of events) {
    const answer = toCardAnswer(event)
    if (answer) result.push(answer)
  }

  return result
}
