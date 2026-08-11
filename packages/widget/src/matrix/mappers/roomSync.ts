import type { RoomSyncPatch } from '../../domain/roomSync'
import type * as Matrix from '../wire/types'
import { collectCardAnswers } from './adaptiveCard'
import { collectMediaVerdicts } from './mediaStatus'
import { toOperatorState } from './operator'
import { toReadMarkers } from './receipts'
import { timelineEventsToItems } from './timeline'

export function toRoomSyncPatch(joinedRoom: Matrix.JoinedRoom): RoomSyncPatch {
  const stateEvents = joinedRoom.state.events
  const timelineEvents = joinedRoom.timeline.events

  const patch: RoomSyncPatch = {
    timeline: timelineEventsToItems(timelineEvents),
    readMarkers: toReadMarkers(joinedRoom.ephemeral?.events),
    cardAnswers: collectCardAnswers(timelineEvents),
    mediaVerdicts: collectMediaVerdicts(timelineEvents),
    prevBatch: joinedRoom.timeline.prev_batch ?? null,
  }

  const operator = toOperatorState([...stateEvents, ...timelineEvents])

  return operator ? { ...patch, operator } : patch
}
