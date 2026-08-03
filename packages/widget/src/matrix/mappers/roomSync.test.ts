import { describe, expect, it } from 'vitest'
import {
  emptyJoinedRoom,
  OPERATOR_ID,
  operatorCurrentEvent,
  readReceipt,
  roomMessageEvent,
} from '../../shared/testUtils/matrixFixtures'
import { toRoomSyncPatch } from './roomSync'

const OPERATOR = '@operator:bank'

describe('toRoomSyncPatch', () => {
  it('собирает ленту, оператора, маркеры и курсор из одного sync-снимка', () => {
    const patch = toRoomSyncPatch(
      emptyJoinedRoom({
        state: { events: [operatorCurrentEvent()] },
        timeline: { prev_batch: 'p1', events: [roomMessageEvent()] },
        ephemeral: { events: [readReceipt('$m1', OPERATOR)] },
      }),
    )

    expect(patch.timeline).toHaveLength(1)
    expect(patch.operator).toEqual({ isActive: true, id: OPERATOR_ID, displayName: 'Support' })
    expect(patch.readMarkers).toEqual([{ userId: OPERATOR, eventId: '$m1' }])
    expect(patch.prevBatch).toBe('p1')
  })

  it('без kc.operator.current поле operator отсутствует — прежний оператор останется в силе', () => {
    const patch = toRoomSyncPatch(emptyJoinedRoom({ timeline: { events: [roomMessageEvent()] } }))

    // именно отсутствие ключа, а не undefined: редьюсер делает patch.operator ?? room.operator
    expect(patch).not.toHaveProperty('operator')
    expect(patch.prevBatch).toBeNull()
  })

  it('оператор объявлен в таймлайне, а не в state — снимок всё равно собирается', () => {
    const patch = toRoomSyncPatch(
      emptyJoinedRoom({ timeline: { events: [operatorCurrentEvent({ status: 'left' })] } }),
    )

    expect(patch.operator).toEqual({ isActive: false, id: null, displayName: null })
  })
})
