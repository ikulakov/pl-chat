import { describe, expect, it } from 'vitest'
import {
  emptyJoinedRoom,
  operatorCurrentEvent,
  roomMessageEvent,
} from '../../shared/testUtils/matrixFixtures'
import type { JoinedRoom } from '../../types/matrix'
import { chatRuntimeReducer } from '../chatRuntimeReducer'
import type { Identity } from '../model'
import { INITIAL_RUNTIME_STATE } from '../store'

const IDENTITY: Identity = { userId: '@user:bank', roomId: '!room:bank' }

function joinedRoom(): JoinedRoom {
  return emptyJoinedRoom({
    state: { events: [operatorCurrentEvent()] },
    timeline: { limited: true, prev_batch: 'p1', events: [roomMessageEvent()] },
  })
}

describe('chatRuntimeReducer', () => {
  it('starts a session and applies the initial room action', () => {
    const next = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      joinedRoom: joinedRoom(),
    })

    expect(next.phase).toBe('connected')
    expect(next.identity).toEqual(IDENTITY)
    expect(next.cursor).toBe('s1')
    expect(next.room.messages).toHaveLength(1)
    expect(next.room.operator.isActive).toBe(true)
  })

  it('resets room state when a new session starts in a different room', () => {
    const connected = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      joinedRoom: joinedRoom(),
    })
    const withDraft = chatRuntimeReducer(connected, {
      type: 'message.optimisticAdded',
      message: {
        localId: 'l1',
        eventId: 'optimistic:l1',
        sender: IDENTITY.userId,
        body: 'old draft',
        ts: 2,
        pending: true,
        failed: false,
      },
    })

    const next = chatRuntimeReducer(withDraft, {
      type: 'session.started',
      identity: { userId: '@new:bank', roomId: '!new:bank' },
      cursor: 's2',
      joinedRoom: emptyJoinedRoom({
        timeline: {
          events: [
            roomMessageEvent({
              event_id: '$new',
              content: { body: 'new session message' },
              origin_server_ts: 3,
            }),
          ],
        },
      }),
    })

    expect(next.room.messages.map((message) => message.body)).toEqual(['new session message'])
  })

  it('sync.received WITHOUT a roomAction keeps the same room reference', () => {
    const connected = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      joinedRoom: joinedRoom(),
    })

    const synced = chatRuntimeReducer(connected, { type: 'sync.received', cursor: 's2' })

    expect(synced.cursor).toBe('s2')
    expect(synced.room).toBe(connected.room)
  })

  it('connection.failed resets identity, cursor and room', () => {
    const connected = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      joinedRoom: joinedRoom(),
    })

    const failed = chatRuntimeReducer(connected, { type: 'connection.failed', error: 'network' })

    expect(failed.phase).toBe('error')
    expect(failed.error).toBe('network')
    expect(failed.identity).toBeNull()
    expect(failed.cursor).toBeNull()
    expect(failed.room.messages).toHaveLength(0)
  })

  it('routes optimistic add / sent through the room reducer', () => {
    const withOptimistic = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      {
        type: 'message.optimisticAdded',
        message: {
          localId: 'l1',
          eventId: 'optimistic:l1',
          sender: IDENTITY.userId,
          body: 'hi',
          ts: 1,
          pending: true,
          failed: false,
        },
      },
    )
    expect(withOptimistic.room.messages[0]!.pending).toBe(true)

    const sent = chatRuntimeReducer(withOptimistic, {
      type: 'message.sent',
      localId: 'l1',
      eventId: '$real',
    })

    expect(sent.room.messages[0]!.eventId).toBe('$real')
    expect(sent.room.messages[0]!.pending).toBe(false)
  })
})
