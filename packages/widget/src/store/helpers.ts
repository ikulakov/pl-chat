import { MatrixEventType, OperatorStatus } from '../matrix/consts'
import type { ClientEvent, OperatorCurrentEvent } from '../types/matrix'
import type { ChatMessage, OperatorState } from './model'

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
