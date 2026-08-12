import type { RoomSyncPatch } from '../../domain/roomSync'
import type * as Matrix from '../wire/types'
import { toOperatorState } from './operator'
import { toReactionDelta } from './reactions'
import { toReadMarkers } from './receipts'
import { timelineEventsToItems } from './timeline'

export function toRoomSyncPatch(joinedRoom: Matrix.JoinedRoom): RoomSyncPatch {
  const stateEvents = joinedRoom.state.events
  const timelineEvents = joinedRoom.timeline.events

  const patch: RoomSyncPatch = {
    timeline: timelineEventsToItems(timelineEvents),
    readMarkers: toReadMarkers(joinedRoom.ephemeral?.events),
    reactions: toReactionDelta(timelineEvents),
    prevBatch: joinedRoom.timeline.prev_batch ?? null,
  }

  const operator = toOperatorState([...stateEvents, ...timelineEvents])

  return operator ? { ...patch, operator } : patch
}
