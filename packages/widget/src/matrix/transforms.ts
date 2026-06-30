import type { ChatMessage } from '../store/model'
import type { ClientEvent, RoomMessageEvent } from '../types/matrix'
import { MatrixEventType } from './consts'

export function timelineToMessages(events: ClientEvent[] = []): ChatMessage[] {
  return events
    .filter((e): e is RoomMessageEvent => e.type === MatrixEventType.RoomMessage)
    .map((e) => ({
      localId: e.event_id,
      eventId: e.event_id,
      sender: e.sender,
      body: e.content.body,
      ts: e.origin_server_ts,
      pending: false,
      failed: false,
    }))
}
