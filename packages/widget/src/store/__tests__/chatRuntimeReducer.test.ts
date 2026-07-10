import { describe, expect, it } from 'vitest'
import {
  chatMessage,
  emptyJoinedRoom,
  OPERATOR_ID,
  operatorCurrentEvent,
  roomMessageEvent,
} from '../../shared/testUtils/matrixFixtures'
import type { JoinedRoom } from '../../types/matrix'
import { chatRuntimeReducer } from '../chatRuntimeReducer'
import type { ChatMessage, Identity } from '../model'
import { INITIAL_RUNTIME_STATE } from '../store'

const IDENTITY: Identity = { userId: '@user:bank', roomId: '!room:bank' }

function joinedRoom(): JoinedRoom {
  return emptyJoinedRoom({
    state: { events: [operatorCurrentEvent()] },
    timeline: { limited: true, prev_batch: 'p1', events: [roomMessageEvent()] },
  })
}

function ownMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return chatMessage({
    localId: 'l1',
    eventId: 'optimistic:l1',
    sender: IDENTITY.userId,
    body: 'hi',
    ts: 1,
    pending: true,
    ...overrides,
  })
}

describe('chatRuntimeReducer', () => {
  it('starts a session and applies the initial room snapshot (messages + operator)', () => {
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
    expect(next.room.operator).toEqual({ isActive: true, id: OPERATOR_ID, displayName: 'Support' })
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
      message: ownMessage({ body: 'old draft', ts: 2 }),
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

  it('session.recovering keeps the current runtime data while recovery is in flight', () => {
    const connected = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      joinedRoom: joinedRoom(),
    })
    const withError = { ...connected, error: 'expired' }

    const recovering = chatRuntimeReducer(withError, { type: 'session.recovering' })

    expect(recovering.phase).toBe('recovering')
    expect(recovering.error).toBeNull()
    expect(recovering.identity).toEqual(IDENTITY)
    expect(recovering.cursor).toBe('s1')
    expect(recovering.room).toBe(connected.room)
  })

  it('routes optimistic add / sent through the room slice', () => {
    const withOptimistic = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      { type: 'message.optimisticAdded', message: ownMessage({}) },
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

  it('marks a still-pending optimistic message as failed', () => {
    const withOptimistic = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      { type: 'message.optimisticAdded', message: ownMessage({}) },
    )

    const failed = chatRuntimeReducer(withOptimistic, { type: 'message.failed', localId: 'l1' })

    expect(failed.room.messages[0]!.pending).toBe(false)
    expect(failed.room.messages[0]!.failed).toBe(true)
  })

  it('does not mark a message failed after sync already resolved it', () => {
    const withOptimistic = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      { type: 'message.optimisticAdded', message: ownMessage({}) },
    )
    const resolvedBySync = chatRuntimeReducer(withOptimistic, {
      type: 'sync.received',
      cursor: 's1',
      joinedRoom: emptyJoinedRoom({
        // тело совпадает с оптимистичным ('hi') — иначе mergeMessages не свяжет черновик с реальным событием
        timeline: {
          events: [
            roomMessageEvent({
              event_id: '$real',
              sender: IDENTITY.userId,
              content: { body: 'hi' },
            }),
          ],
        },
      }),
    })

    const failedLate = chatRuntimeReducer(resolvedBySync, { type: 'message.failed', localId: 'l1' })

    expect(failedLate.room.messages).toHaveLength(1)
    expect(failedLate.room.messages[0]!.eventId).toBe('$real')
    expect(failedLate.room.messages[0]!.failed).toBe(false)
  })

  it('retries a failed message in place — pending again, failed cleared, index unchanged', () => {
    const withFirst = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      {
        type: 'message.optimisticAdded',
        message: ownMessage({ localId: 'l1', body: 'first', pending: false, failed: true }),
      },
    )
    const withSecond = chatRuntimeReducer(withFirst, {
      type: 'message.optimisticAdded',
      message: ownMessage({
        localId: 'l2',
        eventId: 'optimistic:l2',
        body: 'second',
        ts: 2,
        pending: false,
      }),
    })

    const retried = chatRuntimeReducer(withSecond, { type: 'message.retrying', localId: 'l1' })

    expect(retried.room.messages).toHaveLength(2)
    expect(retried.room.messages[0]).toMatchObject({ localId: 'l1', pending: true, failed: false })
    expect(retried.room.messages[1]).toMatchObject({ localId: 'l2', pending: false, failed: false })
  })
})
