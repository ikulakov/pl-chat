import { MatrixEventType, OperatorStatus } from '../shared/matrixConst'
import type { ChatMessage } from '../store/messages.slice'
import type { ClientEvent, RoomMessageEvent } from '../types/matrix'
import type { SyncResponse } from '../types/requests'

export function findRoomId(sync: SyncResponse): string | null {
  const joined = sync.rooms?.join
  if (!joined) return null
  return Object.keys(joined)[0] ?? null
}

export function isOperatorActive(stateEvents: ClientEvent[] = []): boolean {
  return stateEvents.some(
    (e) =>
      e.type === MatrixEventType.OperatorCurrent &&
      e.state_key === '' &&
      e.content.status === OperatorStatus.Active,
  )
}

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

export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const result = [...existing]

  for (const msg of incoming) {
    if (result.some((m) => m.eventId === msg.eventId)) continue

    // race: если sync вернул событие раньше, чем пришёл ответ на PUT /send
    // находим оптимистичный черновик и обновляем его реальным event_id
    const pendingIdx = result.findIndex(
      (m) => m.pending && !m.failed && m.sender === msg.sender && m.body === msg.body,
    )
    if (pendingIdx !== -1) {
      result[pendingIdx] = {
        ...result[pendingIdx]!,
        eventId: msg.eventId,
        ts: msg.ts,
        pending: false,
      }
    } else {
      result.push(msg)
    }
  }

  return result.toSorted((a, b) => a.ts - b.ts)
}
