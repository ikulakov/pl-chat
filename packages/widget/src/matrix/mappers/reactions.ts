import type { ReactionDelta } from '../../domain/reactions'
import { RelType } from '../wire/consts'
import { isReaction, isRedaction } from '../wire/guards'
import type * as Matrix from '../wire/types'

/**
 * Собирает изменения реакций из сырых событий комнаты (timeline из sync либо страница истории).
 * События обязаны идти в хронологическом порядке — от него зависит результат.
 *
 * Снятая реакция приезжает из истории с пустым `content` (сервер обнуляет его во всех
 * read-путях, само событие из ленты не исчезает) — такую пропускаем.
 */
export function toReactionDelta(events: Matrix.ClientEvent[] = []): ReactionDelta {
  const delta: ReactionDelta = []

  for (const event of events) {
    if (isReaction(event)) {
      const relation = event.content['m.relates_to']
      if (relation?.rel_type !== RelType.Annotation) continue
      if (!relation.event_id || !relation.key) continue

      delta.push({
        op: 'add',
        targetEventId: relation.event_id,
        entry: { eventId: event.event_id, sender: event.sender, key: relation.key },
      })
      continue
    }

    if (isRedaction(event) && event.content.redacts) {
      delta.push({ op: 'remove', eventId: event.content.redacts })
    }
  }

  return delta
}
