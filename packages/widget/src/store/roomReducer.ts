import type { JoinedRoom } from '../types/matrix'
import { mergeMessages, mergeTimelineEvents, reduceOperator, timelineToMessages } from './helpers'
import type { RoomState, RuntimeAction } from './model'

function applySync(room: RoomState, joinedRoom: JoinedRoom): RoomState {
  const timelineEvents = joinedRoom.timeline.events
  const stateEvents = joinedRoom.state.events
  return {
    ...room,
    timeline: mergeTimelineEvents(room.timeline, timelineEvents),
    messages: mergeMessages(room.messages, timelineToMessages(timelineEvents)),
    operator: reduceOperator(room.operator, [...stateEvents, ...timelineEvents]),
  }
}

export function roomReducer(room: RoomState, action: RuntimeAction): RoomState {
  switch (action.type) {
    case 'session.started':
      return applySync(room, action.joinedRoom)
    case 'sync.received':
      return action.joinedRoom ? applySync(room, action.joinedRoom) : room
    case 'message.optimisticAdded':
      return { ...room, messages: [...room.messages, action.message] }
    case 'message.sent':
      return {
        ...room,
        messages: room.messages.map((m) =>
          m.localId === action.localId ? { ...m, eventId: action.eventId, pending: false } : m,
        ),
      }
    case 'message.failed':
      return {
        ...room,
        messages: room.messages.map((m) =>
          m.localId === action.localId && m.pending ? { ...m, pending: false, failed: true } : m,
        ),
      }
    default:
      return room
  }
}
