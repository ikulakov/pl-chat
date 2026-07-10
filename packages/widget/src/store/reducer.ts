import { timelineEventsToItems } from '../domain/eventMapping'
import { mergeTimeline } from '../domain/mergeTimeline'
import { reduceOperator } from '../domain/operator'
import { isSystem } from '../domain/timeline'
import type { JoinedRoom } from '../matrix/types'
import { assertNever } from '../shared/assertNever'
import type { ChatRuntimeState, RoomState, RuntimeAction } from './state'
import { INITIAL_RUNTIME_STATE } from './store'

function updateTimeline(
  state: ChatRuntimeState,
  updater: (timeline: ChatRuntimeState['room']['timeline']) => ChatRuntimeState['room']['timeline'],
): ChatRuntimeState {
  return { ...state, room: { ...state.room, timeline: updater(state.room.timeline) } }
}

function applySync(room: RoomState, joinedRoom: JoinedRoom): RoomState {
  const timelineEvents = joinedRoom.timeline.events
  const stateEvents = joinedRoom.state.events
  return {
    ...room,
    timeline: mergeTimeline(room.timeline, timelineEventsToItems(timelineEvents)),
    operator: reduceOperator(room.operator, [...stateEvents, ...timelineEvents]),
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

    default:
      return assertNever(action)
  }
}
