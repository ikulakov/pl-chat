import { describe, expect, it } from 'vitest'
import {
  emptyJoinedRoom,
  OPERATOR_ID,
  operatorCurrentEvent,
  roomMessageEvent,
} from '../../shared/testUtils/matrixFixtures'
import { roomReducer } from '../roomReducer'
import { INITIAL_ROOM_STATE } from '../store'

const OWN_USER_ID = '@user:bank'

describe('roomReducer', () => {
  it('ingests initial sync into messages and operator state', () => {
    const next = roomReducer(INITIAL_ROOM_STATE, {
      type: 'sync.received',
      cursor: 's0',
      joinedRoom: emptyJoinedRoom({
        state: { events: [operatorCurrentEvent()] },
        timeline: { limited: true, prev_batch: 'p1', events: [roomMessageEvent()] },
      }),
    })

    expect(next.operator).toEqual({
      isActive: true,
      id: OPERATOR_ID,
      displayName: 'Support',
    })
    expect(next.messages).toHaveLength(1)
    expect(next.messages[0]!.body).toBe('hello')
  })

  it('resolves optimistic message when sync returns the real event first', () => {
    const withOptimistic = roomReducer(INITIAL_ROOM_STATE, {
      type: 'message.optimisticAdded',
      message: {
        localId: 'local-1',
        eventId: 'optimistic:local-1',
        sender: OWN_USER_ID,
        body: 'hello',
        ts: 1,
        pending: true,
        failed: false,
      },
    })

    const next = roomReducer(withOptimistic, {
      type: 'sync.received',
      cursor: 's1',
      joinedRoom: emptyJoinedRoom({
        timeline: { events: [roomMessageEvent({ event_id: '$real', sender: OWN_USER_ID })] },
      }),
    })

    expect(next.messages).toHaveLength(1)
    expect(next.messages[0]!.localId).toBe('local-1')
    expect(next.messages[0]!.eventId).toBe('$real')
    expect(next.messages[0]!.pending).toBe(false)
  })

  it('does not mark a message failed after sync already resolved it', () => {
    const withOptimistic = roomReducer(INITIAL_ROOM_STATE, {
      type: 'message.optimisticAdded',
      message: {
        localId: 'local-1',
        eventId: 'optimistic:local-1',
        sender: OWN_USER_ID,
        body: 'hello',
        ts: 1,
        pending: true,
        failed: false,
      },
    })

    const resolvedBySync = roomReducer(withOptimistic, {
      type: 'sync.received',
      cursor: 's1',
      joinedRoom: emptyJoinedRoom({
        timeline: { events: [roomMessageEvent({ event_id: '$real', sender: OWN_USER_ID })] },
      }),
    })

    const failedLate = roomReducer(resolvedBySync, {
      type: 'message.failed',
      localId: 'local-1',
    })

    expect(failedLate.messages).toHaveLength(1)
    expect(failedLate.messages[0]!.eventId).toBe('$real')
    expect(failedLate.messages[0]!.pending).toBe(false)
    expect(failedLate.messages[0]!.failed).toBe(false)
  })

  it('marks still-pending optimistic message as failed', () => {
    const withOptimistic = roomReducer(INITIAL_ROOM_STATE, {
      type: 'message.optimisticAdded',
      message: {
        localId: 'local-1',
        eventId: 'optimistic:local-1',
        sender: OWN_USER_ID,
        body: 'hello',
        ts: 1,
        pending: true,
        failed: false,
      },
    })

    const failed = roomReducer(withOptimistic, {
      type: 'message.failed',
      localId: 'local-1',
    })

    expect(failed.messages[0]!.eventId).toBe('optimistic:local-1')
    expect(failed.messages[0]!.pending).toBe(false)
    expect(failed.messages[0]!.failed).toBe(true)
  })

  it('returns the same reference for unknown actions', () => {
    const room = INITIAL_ROOM_STATE
    const next = roomReducer(room, { type: 'connection.connecting' })
    expect(next).toBe(room)
  })
})
