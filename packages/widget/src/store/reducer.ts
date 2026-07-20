import { timelineEventsToItems } from '../domain/eventMapping'
import { mergeTimeline, prependTimeline } from '../domain/mergeTimeline'
import { reduceOperator } from '../domain/operator'
import { mergeReadReceipts } from '../domain/receipts'
import { isSystem } from '../domain/timeline'
import type { JoinedRoom } from '../matrix/types'
import { assertNever } from '../shared/assertNever'
import type { ChatRuntimeState, RoomState, RuntimeAction } from './state'
import { INITIAL_ROOM_STATE, INITIAL_RUNTIME_STATE } from './store'

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

function startRoom(joinedRoom: JoinedRoom): RoomState {
  return {
    ...applySync(INITIAL_ROOM_STATE, joinedRoom),
    prevBatch: joinedRoom.timeline.prev_batch ?? null,
  }
}

function continueRoom(room: RoomState, joinedRoom: JoinedRoom): RoomState {
  return {
    ...applySync(room, joinedRoom),
    // курсор истории держим свой — из снимка он откатит подгрузку к низу ленты
    prevBatch: room.prevBatch,
    isLoadingHistory: false,
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
      // isSameRoom достижим только в авторизованной зоне:
      // при протухшем токене re-auth авторизованному пользователю вернёт ту же комнату при живой ленте;
      // гостю re-auth всегда даёт новую комнату.
      const isSameRoom = state.identity?.roomId === action.identity.roomId

      return {
        ...state,
        phase: 'connected',
        error: null,
        identity: action.identity,
        cursor: action.cursor,
        room: isSameRoom
          ? continueRoom(state.room, action.joinedRoom)
          : startRoom(action.joinedRoom),
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

    case 'history.loading':
      return updateRoom(state, { isLoadingHistory: true })

    case 'history.loaded':
      return updateRoom(state, {
        timeline: prependTimeline(state.room.timeline, action.items),
        prevBatch: action.prevBatch,
      })

    case 'history.settled':
      return updateRoom(state, { isLoadingHistory: false })

    default:
      return assertNever(action)
  }
}
