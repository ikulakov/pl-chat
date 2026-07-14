import { MatrixEventType, ReceiptType } from '../matrix/consts'
import type { EphemeralEvent, ReceiptEvent } from '../matrix/types'
import { isOptimistic } from './optimistic'
import { isSystem, type TimelineItem } from './timeline'

export interface ReadReceipt {
  eventId: string
}

function isReceiptEvent(event: EphemeralEvent): event is ReceiptEvent {
  return event.type === MatrixEventType.Receipt
}

// Группировка m.read по пользователям userId → eventId на основе ephemeral-событий
function ephemeralEventsToMarkers(
  events: EphemeralEvent[],
): Array<[userId: string, eventId: string]> {
  const markers: Array<[string, string]> = []

  for (const event of events) {
    if (!isReceiptEvent(event)) continue

    for (const [eventId, byType] of Object.entries(event.content)) {
      const readers = byType[ReceiptType.Read]
      if (!readers) continue

      for (const userId of Object.keys(readers)) {
        markers.push([userId, eventId])
      }
    }
  }

  return markers
}

// Обновляет readReceipts участников данными из sync m.receipt.
// canMoveMarker не даёт откатить свою закладку назад: markRead двигает её сразу, а эхо из sync приходит с опозданием.
// Ничего не сдвинулось — возвращаем existing как есть
export function mergeReadReceipts(
  existing: Record<string, ReadReceipt>,
  events: EphemeralEvent[] = [],
  timeline: TimelineItem[],
): Record<string, ReadReceipt> {
  const incomingMarkers = ephemeralEventsToMarkers(events)

  let result = existing
  for (const [userId, eventId] of incomingMarkers) {
    if (!canMoveMarker(timeline, result[userId]?.eventId ?? null, eventId)) continue

    if (result === existing) result = { ...existing }
    result[userId] = { eventId }
  }

  return result
}

// Учитываем только id при скролле вниз + отсекаем повторные id
export function canMoveMarker(
  timeline: TimelineItem[],
  marker: string | null,
  eventId: string,
): boolean {
  if (marker === null) return true
  if (marker === eventId) return false

  const markerIndex = timeline.findIndex((item) => item.eventId === marker)
  // прежний маркер выпал из ленты (пагинация) — сравнивать не с чем, не блокируем
  if (markerIndex === -1) return true

  const eventIndex = timeline.findIndex((item) => item.eventId === eventId)
  // целевое событие ещё не подгружено в ленту
  // (m.receipt приходит раньше своего события, или своё сообщение ещё optimistic)
  if (eventIndex === -1) return true

  return eventIndex > markerIndex
}

// Каждый участник держит одну закладку «дочитал до такого-то события» (она указывает на НАШЕ сообщение).
// Берём чужие закладки → находим самую дальнюю в ленте → всё наше до неё включительно прочитано.
export function readOwnEventIds(
  readReceipts: Record<string, ReadReceipt>,
  timeline: TimelineItem[],
  ownUserId: string,
): Set<string> {
  const readUpToIds = new Set(
    Object.entries(readReceipts)
      .filter(([userId]) => userId !== ownUserId)
      .map(([, receipt]) => receipt.eventId),
  )
  const lastReadIndex = timeline.findLastIndex((item) => readUpToIds.has(item.eventId))

  const readIds = new Set<string>()
  for (let i = 0; i <= lastReadIndex; i++) {
    const item = timeline[i]!
    if (isSystem(item) || item.sender !== ownUserId || isOptimistic(item.eventId)) continue

    readIds.add(item.eventId)
  }

  return readIds
}

// Счётчик непрочитанных: чужие сообщения после собственного read-маркера.
// Если маркера нет или он не найден — считаем непрочитанными все сообщения.
export function countUnread(
  readReceipts: Record<string, ReadReceipt>,
  timeline: TimelineItem[],
  ownUserId: string,
): number {
  const marker = readReceipts[ownUserId]?.eventId
  const markerIndex = marker ? timeline.findIndex((item) => item.eventId === marker) : -1

  let count = 0
  for (let i = markerIndex + 1; i < timeline.length; i++) {
    const item = timeline[i]!
    if (!isSystem(item) && item.sender !== ownUserId) count++
  }
  return count
}
