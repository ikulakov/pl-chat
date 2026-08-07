import type { OperatorState } from './operator'
import type { ReadMarker } from './receipts'
import type { TimelineItem } from './timeline'

export interface RoomSyncPatch {
  timeline: TimelineItem[]
  operator?: OperatorState
  readMarkers: ReadMarker[]
  /** Курсор истории из снимка; используется только при старте комнаты. */
  prevBatch: string | null
}
