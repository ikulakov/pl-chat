import { describe, expect, it } from 'vitest'
import { OPERATOR_ID, roomMessageEvent } from '../../shared/testUtils/matrixFixtures'
import type * as Matrix from '../wire/types'
import { toReactionDelta } from './reactions'

function reactionEvent(
  content: Matrix.ReactionEvent['content'],
  eventId = '$r1',
): Matrix.ReactionEvent {
  return {
    type: 'm.reaction',
    event_id: eventId,
    sender: OPERATOR_ID,
    origin_server_ts: 1,
    content,
  }
}

describe('toReactionDelta', () => {
  it('переводит m.reaction в операцию добавления', () => {
    const delta = toReactionDelta([
      reactionEvent({
        'm.relates_to': { rel_type: 'm.annotation', event_id: '$m1', key: '👍' },
      }),
    ])

    expect(delta).toEqual([
      {
        op: 'add',
        targetEventId: '$m1',
        entry: { eventId: '$r1', sender: OPERATOR_ID, key: '👍' },
      },
    ])
  })

  it('пропускает снятую реакцию: у неё сервер обнуляет content во всех read-путях', () => {
    expect(toReactionDelta([reactionEvent({})])).toEqual([])
  })

  it('пропускает связь чужого типа — аннотацией является не всякое отношение', () => {
    const delta = toReactionDelta([
      reactionEvent({
        // @ts-expect-error — на проводе может приехать любой rel_type, маппер обязан его отсеять
        'm.relates_to': { rel_type: 'm.replace', event_id: '$m1', key: '👍' },
      }),
    ])

    expect(delta).toEqual([])
  })

  it('переводит m.room.redaction в операцию снятия', () => {
    const redaction: Matrix.RedactionEvent = {
      type: 'm.room.redaction',
      event_id: '$red1',
      sender: OPERATOR_ID,
      origin_server_ts: 2,
      content: { redacts: '$r1' },
    }

    expect(toReactionDelta([redaction])).toEqual([{ op: 'remove', eventId: '$r1' }])
  })

  it('игнорирует обычные сообщения и сохраняет порядок событий', () => {
    const delta = toReactionDelta([
      reactionEvent({ 'm.relates_to': { rel_type: 'm.annotation', event_id: '$m1', key: '👍' } }),
      roomMessageEvent(),
      {
        type: 'm.room.redaction',
        event_id: '$red1',
        sender: OPERATOR_ID,
        origin_server_ts: 3,
        content: { redacts: '$r1' },
      },
    ])

    expect(delta.map((op) => op.op)).toEqual(['add', 'remove'])
  })

  it('на отсутствующем списке событий отдаёт пустую дельту', () => {
    expect(toReactionDelta()).toEqual([])
  })
})
