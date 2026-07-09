import { assertNever } from '../shared/assertNever'
import { applySync, updateMessages } from './helpers'
import type { ChatRuntimeState, RuntimeAction } from './model'
import { INITIAL_RUNTIME_STATE } from './store'

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
      return updateMessages(state, (messages) => [...messages, action.message])

    case 'message.sent':
      return updateMessages(state, (messages) =>
        messages.map((m) =>
          m.localId === action.localId ? { ...m, eventId: action.eventId, pending: false } : m,
        ),
      )

    case 'message.failed':
      return updateMessages(state, (messages) =>
        messages.map((m) =>
          m.localId === action.localId && m.pending ? { ...m, pending: false, failed: true } : m,
        ),
      )

    case 'message.retrying':
      return updateMessages(state, (messages) =>
        messages.map((m) =>
          m.localId === action.localId ? { ...m, pending: true, failed: false } : m,
        ),
      )

    default:
      return assertNever(action)
  }
}
