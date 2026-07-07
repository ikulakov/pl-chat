import type { ChatUIState, ConnectionStatus, Phase, RoomState } from './model'
import type { ChatStoreState } from './store'

function deriveStatus(phase: Phase, room: RoomState): ConnectionStatus {
  switch (phase) {
    case 'idle':
      return 'idle'
    case 'connecting':
    case 'recovering':
      return 'connecting'
    case 'error':
      return 'error'
    case 'connected':
      return room.operator.isActive ? 'active' : 'waiting'
  }
}

export function selectChatUIState(state: ChatStoreState): ChatUIState {
  return {
    isOpen: state.isOpen,
    status: deriveStatus(state.phase, state.room),
    userId: state.identity?.userId ?? null,
    error: state.error,
    messages: state.room.messages,
    viewport: state.viewport,
  }
}
