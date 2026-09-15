import type { ChatRuntimeState, RoomState } from './state'

export const INITIAL_ROOM_STATE: RoomState = {
  timeline: [],
  operator: {
    id: null,
    displayName: null,
    isActive: false,
  },
  readReceipts: {},
  reactions: {},
  cardAnswers: {},
  mediaVerdicts: {},
  replyTarget: null,
  prevBatch: null,
  isLoadingHistory: false,
}

export const INITIAL_RUNTIME_STATE: ChatRuntimeState = {
  phase: 'idle',
  online: true,
  identity: null,
  cursor: null,
  room: INITIAL_ROOM_STATE,
}
