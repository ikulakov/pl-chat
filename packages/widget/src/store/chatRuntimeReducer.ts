import type { ChatRuntimeState, RuntimeAction } from './model'
import { roomReducer } from './roomReducer'
import { INITIAL_RUNTIME_STATE } from './store'

export function chatRuntimeReducer(
  state: ChatRuntimeState,
  action: RuntimeAction,
): ChatRuntimeState {
  const room = roomReducer(state.room, action)

  switch (action.type) {
    case 'connection.connecting':
      return {
        ...state,
        phase: 'connecting',
        error: null,
        room,
      }

    case 'session.started':
      return {
        ...state,
        phase: 'connected',
        error: null,
        identity: action.identity,
        cursor: action.cursor,
        room,
      }

    case 'connection.failed':
      return { ...INITIAL_RUNTIME_STATE, phase: 'error', error: action.error }

    case 'sync.received':
      return { ...state, cursor: action.cursor, room }

    case 'message.optimisticAdded':
    case 'message.sent':
    case 'message.failed':
      return { ...state, room }
  }
}
