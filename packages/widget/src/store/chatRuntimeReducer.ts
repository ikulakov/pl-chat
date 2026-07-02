import type { ChatRuntimeState, RuntimeAction } from './model'
import { roomReducer } from './roomReducer'
import { INITIAL_RUNTIME_STATE } from './store'

export function chatRuntimeReducer(
  state: ChatRuntimeState,
  action: RuntimeAction,
): ChatRuntimeState {
  switch (action.type) {
    case 'connection.connecting':
      return { ...state, phase: 'connecting', error: null }

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
        room: roomReducer(baseRoom, action),
      }
    }

    case 'sync.received':
      return { ...state, cursor: action.cursor, room: roomReducer(state.room, action) }

    case 'message.optimisticAdded':
    case 'message.sent':
    case 'message.failed':
      return { ...state, room: roomReducer(state.room, action) }

    default:
      return state
  }
}
