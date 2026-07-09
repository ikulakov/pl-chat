import { MatrixEventType, OperatorStatus } from '../matrix/consts'
import type { ClientEvent, OperatorCurrentEvent, RoomMessageEvent } from '../types/matrix'
import type { ChatMessage, OperatorState } from './model'

function isRoomMessage(event: ClientEvent): event is RoomMessageEvent {
  return event.type === MatrixEventType.RoomMessage
}

export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const result = [...existing]

  for (const incomingMsg of incoming) {
    if (result.some((m) => m.eventId === incomingMsg.eventId)) continue

    // race: если sync вернул событие раньше, чем пришёл ответ на PUT /send
    // находим оптимистичный черновик и обновляем его реальным event_id
    const pendingIdx = result.findIndex(
      (m) =>
        m.pending && !m.failed && m.sender === incomingMsg.sender && m.body === incomingMsg.body,
    )
    if (pendingIdx !== -1) {
      result[pendingIdx] = {
        ...result[pendingIdx]!,
        eventId: incomingMsg.eventId,
        ts: incomingMsg.ts,
        pending: false,
      }
    } else {
      result.push(incomingMsg)
    }
  }

  return result
}

export function mergeTimelineEvents(
  existing: ClientEvent[],
  incoming: ClientEvent[],
): ClientEvent[] {
  const ids = new Set(existing.map((event) => event.event_id))
  return [...existing, ...incoming.filter((event) => !ids.has(event.event_id))]
}

export function reduceOperator(current: OperatorState, events: ClientEvent[]): OperatorState {
  const operatorEvent = events.findLast(
    (event): event is OperatorCurrentEvent =>
      event.type === MatrixEventType.OperatorCurrent && event.state_key === '',
  )
  if (!operatorEvent) return current

  const isActive = operatorEvent.content.status === OperatorStatus.Active

  return {
    isActive,
    id: isActive ? (operatorEvent.content.operator_id ?? operatorEvent.sender) : null,
    displayName: isActive ? (operatorEvent.content.displayname ?? null) : null,
  }
}

export function timelineToMessages(events: ClientEvent[] = []): ChatMessage[] {
  return events.filter(isRoomMessage).map((e) => ({
    localId: e.event_id,
    eventId: e.event_id,
    sender: e.sender,
    body: e.content.body,
    ts: e.origin_server_ts,
    pending: false,
    failed: false,
  }))
}
