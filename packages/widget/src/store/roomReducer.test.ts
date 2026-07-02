import { describe, expect, it } from 'vitest'
import { MatrixEventType, MsgType, OperatorStatus } from '../matrix/consts'
import type { JoinedRoom } from '../types/matrix'
import { roomReducer } from './roomReducer'
import { INITIAL_ROOM_STATE } from './store'

const OWN_USER_ID = '@user:bank'
const OPERATOR_ID = '@operator:bank'

function joinedRoom(overrides: Partial<JoinedRoom> = {}): JoinedRoom {
  return {
    state: { events: [] },
    timeline: { events: [] },
    ...overrides,
  }
}

describe('roomReducer', () => {
  it('ingests initial sync into messages and operator state', () => {
    const next = roomReducer(INITIAL_ROOM_STATE, {
      type: 'sync.received',
      cursor: 's0',
      joinedRoom: joinedRoom({
        state: {
          events: [
            {
              type: MatrixEventType.OperatorCurrent,
              state_key: '',
              event_id: '$operator',
              sender: OPERATOR_ID,
              origin_server_ts: 1,
              content: {
                status: OperatorStatus.Active,
                operator_id: OPERATOR_ID,
                displayname: 'Support',
              },
            },
          ],
        },
        timeline: {
          limited: true,
          prev_batch: 'p1',
          events: [
            {
              type: MatrixEventType.RoomMessage,
              event_id: '$m1',
              sender: OPERATOR_ID,
              origin_server_ts: 2,
              content: { msgtype: MsgType.Text, body: 'hello' },
            },
          ],
        },
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
      joinedRoom: joinedRoom({
        timeline: {
          events: [
            {
              type: MatrixEventType.RoomMessage,
              event_id: '$real',
              sender: OWN_USER_ID,
              origin_server_ts: 2,
              content: { msgtype: MsgType.Text, body: 'hello' },
            },
          ],
        },
      }),
    })

    expect(next.messages).toHaveLength(1)
    expect(next.messages[0]!.localId).toBe('local-1')
    expect(next.messages[0]!.eventId).toBe('$real')
    expect(next.messages[0]!.pending).toBe(false)
  })

  it('returns the same reference for unknown actions', () => {
    const room = INITIAL_ROOM_STATE
    const next = roomReducer(room, { type: 'connection.connecting' })
    expect(next).toBe(room)
  })
})
