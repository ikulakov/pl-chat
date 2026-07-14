import { timelineEventsToItems } from '../domain/eventMapping'
import { mergeTimeline } from '../domain/mergeTimeline'
import { reduceOperator } from '../domain/operator'
import { mergeReadReceipts } from '../domain/receipts'
import { isSystem } from '../domain/timeline'
import type { JoinedRoom } from '../matrix/types'
import { assertNever } from '../shared/assertNever'
import type { ChatRuntimeState, RoomState, RuntimeAction } from './state'
import { INITIAL_RUNTIME_STATE } from './store'

function updateRoom(state: ChatRuntimeState, patch: Partial<RoomState>): ChatRuntimeState {
  return { ...state, room: { ...state.room, ...patch } }
}

function updateTimeline(
  state: ChatRuntimeState,
  updater: (timeline: RoomState['timeline']) => RoomState['timeline'],
): ChatRuntimeState {
  return updateRoom(state, { timeline: updater(state.room.timeline) })
}

function applySync(room: RoomState, joinedRoom: JoinedRoom): RoomState {
  const stateEvents = joinedRoom.state.events
  const timelineEvents = joinedRoom.timeline.events
  const ephemeralEvents = joinedRoom.ephemeral?.events

  const timeline = mergeTimeline(room.timeline, timelineEventsToItems(timelineEvents))

  return {
    ...room,
    timeline,
    operator: reduceOperator(room.operator, [...stateEvents, ...timelineEvents]),
    readReceipts: mergeReadReceipts(room.readReceipts, ephemeralEvents, timeline),
  }
}

export function chatRuntimeReducer(
  state: ChatRuntimeState,
  action: RuntimeAction,
): ChatRuntimeState {
  switch (action.type) {
    case 'connection.connecting':
      return { ...state, phase: 'connecting', error: null }

    case 'session.recovering':
      return { ...state, phase: 'recovering', error: null }

    case 'connection.failed':
      return { ...INITIAL_RUNTIME_STATE, phase: 'error', error: action.error }

    case 'session.started': {
      const baseRoom =
        state.identity?.roomId === action.identity.roomId ? state.room : INITIAL_RUNTIME_STATE.room

      return {
        ...state,
        phase: 'connected',
        error: null,
        identity: action.identity,
        cursor: action.cursor,
        room: applySync(baseRoom, action.joinedRoom),
      }
    }

    case 'sync.received':
      return {
        ...state,
        cursor: action.cursor,
        room: action.joinedRoom ? applySync(state.room, action.joinedRoom) : state.room,
      }

    case 'message.optimisticAdded':
      return updateTimeline(state, (timeline) => [...timeline, action.message])

    case 'message.sent':
      return updateTimeline(state, (timeline) =>
        timeline.map((m) =>
          !isSystem(m) && m.localId === action.localId
            ? { ...m, eventId: action.eventId, sendStatus: 'sent' }
            : m,
        ),
      )

    case 'message.failed':
      return updateTimeline(state, (timeline) =>
        timeline.map((m) =>
          !isSystem(m) && m.localId === action.localId && m.sendStatus === 'sending'
            ? { ...m, sendStatus: 'failed' }
            : m,
        ),
      )

    case 'message.retrying':
      return updateTimeline(state, (timeline) =>
        timeline.map((m) =>
          !isSystem(m) && m.localId === action.localId ? { ...m, sendStatus: 'sending' } : m,
        ),
      )

    case 'receipt.markedRead':
      return updateRoom(state, {
        readReceipts: {
          ...state.room.readReceipts,
          [action.userId]: { eventId: action.eventId },
        },
      })

    case 'receipt.sendFailed': {
      if (state.room.readReceipts[action.userId]?.eventId !== action.eventId) return state

      const readReceipts = { ...state.room.readReceipts }

      if (action.rollbackTo === null) {
        delete readReceipts[action.userId]
      } else {
        readReceipts[action.userId] = { eventId: action.rollbackTo }
      }
      return updateRoom(state, { readReceipts })
    }

    default:
      return assertNever(action)
  }
}
