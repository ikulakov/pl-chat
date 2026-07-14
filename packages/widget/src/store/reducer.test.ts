import { describe, expect, it } from 'vitest'
import {
  emptyJoinedRoom,
  OPERATOR_ID,
  operatorCurrentEvent,
  roomMessageEvent,
  textItem,
} from '../shared/testUtils/matrixFixtures'
import type { TextTimelineItem } from '../domain/timeline'
import type { EphemeralEvent, JoinedRoom } from '../matrix/types'
import { chatRuntimeReducer } from './reducer'
import type { ChatRuntimeState, Identity } from './state'
import { INITIAL_RUNTIME_STATE } from './store'

const IDENTITY: Identity = { userId: '@user:bank', roomId: '!room:bank' }
const OPERATOR = '@operator:bank'

function readReceipt(eventId: string, reader: string): EphemeralEvent {
  return { type: 'm.receipt', content: { [eventId]: { 'm.read': { [reader]: { ts: 1 } } } } }
}

// connected-состояние с одним своим доставленным ('sent') сообщением $real в таймлайне
function connectedWithSentMessage(): ChatRuntimeState {
  return {
    ...INITIAL_RUNTIME_STATE,
    phase: 'connected',
    identity: IDENTITY,
    cursor: 's1',
    room: {
      ...INITIAL_RUNTIME_STATE.room,
      timeline: [
        textItem({
          localId: 'l1',
          eventId: '$real',
          sender: IDENTITY.userId,
          body: 'hi',
          ts: 1,
          sendStatus: 'sent',
        }),
      ],
    },
  }
}

function joinedRoom(): JoinedRoom {
  return emptyJoinedRoom({
    state: { events: [operatorCurrentEvent()] },
    timeline: { limited: true, prev_batch: 'p1', events: [roomMessageEvent()] },
  })
}

function ownMessage(
  overrides: Partial<Omit<TextTimelineItem, 'kind' | 'content'>> & { body?: string } = {},
): TextTimelineItem {
  return textItem({
    localId: 'l1',
    eventId: 'optimistic:l1',
    sender: IDENTITY.userId,
    body: 'hi',
    ts: 1,
    sendStatus: 'sending',
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
    expect(next.room.timeline).toHaveLength(1)
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

    expect(next.room.timeline.map((message) => message.content.body)).toEqual([
      'new session message',
    ])
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
    expect(failed.room.timeline).toHaveLength(0)
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

  it('ответ PUT резолвит черновик: реальный eventId + «отправлено»', () => {
    // 200 от /send по Matrix-спеке = «событие отправлено», как в Element (EventStatus.SENT
    // ставится по HTTP-ответу, не по echo).
    const withOptimistic = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      { type: 'message.optimisticAdded', message: ownMessage({}) },
    )
    expect(withOptimistic.room.timeline[0]).toMatchObject({ sendStatus: 'sending' })

    const resolved = chatRuntimeReducer(withOptimistic, {
      type: 'message.sent',
      localId: 'l1',
      eventId: '$real',
    })

    expect(resolved.room.timeline[0]!.eventId).toBe('$real')
    expect(resolved.room.timeline[0]).toMatchObject({ sendStatus: 'sent' })
  })

  it('marks a still-pending optimistic message as failed', () => {
    const withOptimistic = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      { type: 'message.optimisticAdded', message: ownMessage({}) },
    )

    const failed = chatRuntimeReducer(withOptimistic, { type: 'message.failed', localId: 'l1' })

    expect(failed.room.timeline[0]).toMatchObject({ sendStatus: 'failed' })
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
        // тело совпадает с оптимистичным ('hi') — иначе mergeTimeline не свяжет черновик с реальным событием
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

    expect(failedLate.room.timeline).toHaveLength(1)
    expect(failedLate.room.timeline[0]!.eventId).toBe('$real')
    expect(failedLate.room.timeline[0]).toMatchObject({ sendStatus: 'sent' })
  })

  it('folds operator read receipt from ephemeral into readReceipts (индикатор — при рендере)', () => {
    const next = chatRuntimeReducer(connectedWithSentMessage(), {
      type: 'sync.received',
      cursor: 's2',
      joinedRoom: emptyJoinedRoom({ ephemeral: { events: [readReceipt('$real', OPERATOR)] } }),
    })

    // sendStatus не мутируется — «прочитано» вычисляется в рендере из readReceipts
    expect(next.room.readReceipts[OPERATOR]).toEqual({ eventId: '$real' })
    expect(next.room.timeline[0]).toMatchObject({ sendStatus: 'sent' })
  })

  it('keeps prior read receipts across a later sync without ephemeral', () => {
    const withReceipt = chatRuntimeReducer(connectedWithSentMessage(), {
      type: 'sync.received',
      cursor: 's2',
      joinedRoom: emptyJoinedRoom({ ephemeral: { events: [readReceipt('$real', OPERATOR)] } }),
    })

    const resynced = chatRuntimeReducer(withReceipt, {
      type: 'sync.received',
      cursor: 's3',
      joinedRoom: emptyJoinedRoom({
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

    expect(resynced.room.readReceipts[OPERATOR]).toEqual({ eventId: '$real' })
  })

  it('receipt.markedRead двигает собственный маркер оптимистично, receipt.sendFailed откатывает', () => {
    const marked = chatRuntimeReducer(connectedWithSentMessage(), {
      type: 'receipt.markedRead',
      userId: IDENTITY.userId,
      eventId: '$real',
    })
    expect(marked.room.readReceipts[IDENTITY.userId]).toEqual({ eventId: '$real' })

    // POST упал → откат до прежнего значения (null = маркера не было → ключ удаляется)
    const rolledBack = chatRuntimeReducer(marked, {
      type: 'receipt.sendFailed',
      userId: IDENTITY.userId,
      eventId: '$real',
      rollbackTo: null,
    })
    expect(rolledBack.room.readReceipts[IDENTITY.userId]).toBeUndefined()
  })

  it('receipt.sendFailed не откатывает маркер, уехавший дальше более поздним markRead', () => {
    const state = chatRuntimeReducer(connectedWithSentMessage(), {
      type: 'receipt.markedRead',
      userId: IDENTITY.userId,
      eventId: '$newer',
    })

    // провалился СТАРЫЙ POST на $real — маркер уже на $newer, трогать нельзя
    const next = chatRuntimeReducer(state, {
      type: 'receipt.sendFailed',
      userId: IDENTITY.userId,
      eventId: '$real',
      rollbackTo: null,
    })

    expect(next).toBe(state)
    expect(next.room.readReceipts[IDENTITY.userId]).toEqual({ eventId: '$newer' })
  })

  it('серверное эхо НЕ откатывает оптимистичный маркер назад по ленте', () => {
    // лента: [$real, $next]; markRead уже на $next, эхо приносит receipt на $real
    const base = connectedWithSentMessage()
    const withNext = chatRuntimeReducer(base, {
      type: 'sync.received',
      cursor: 's2',
      joinedRoom: emptyJoinedRoom({
        timeline: { events: [roomMessageEvent({ event_id: '$next' })] },
      }),
    })
    const marked = chatRuntimeReducer(withNext, {
      type: 'receipt.markedRead',
      userId: IDENTITY.userId,
      eventId: '$next',
    })

    const echoed = chatRuntimeReducer(marked, {
      type: 'sync.received',
      cursor: 's3',
      joinedRoom: emptyJoinedRoom({
        ephemeral: { events: [readReceipt('$real', IDENTITY.userId)] },
      }),
    })

    expect(echoed.room.readReceipts[IDENTITY.userId]).toEqual({ eventId: '$next' })
  })

  it('retries a failed message in place — sending again, index unchanged', () => {
    const withFirst = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      {
        type: 'message.optimisticAdded',
        message: ownMessage({ localId: 'l1', body: 'first', sendStatus: 'failed' }),
      },
    )
    const withSecond = chatRuntimeReducer(withFirst, {
      type: 'message.optimisticAdded',
      message: ownMessage({
        localId: 'l2',
        eventId: 'optimistic:l2',
        body: 'second',
        ts: 2,
        sendStatus: 'sent',
      }),
    })

    const retried = chatRuntimeReducer(withSecond, { type: 'message.retrying', localId: 'l1' })

    expect(retried.room.timeline).toHaveLength(2)
    expect(retried.room.timeline[0]).toMatchObject({ localId: 'l1', sendStatus: 'sending' })
    expect(retried.room.timeline[1]).toMatchObject({ localId: 'l2', sendStatus: 'sent' })
  })
})
