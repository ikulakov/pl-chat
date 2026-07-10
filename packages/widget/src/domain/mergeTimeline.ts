import { isSystem, type MessageTimelineItem, type TimelineItem } from './timeline'

// race: sync может вернуть событие раньше, чем придёт ответ на PUT /send.
// Сопоставляем по (sender + body) первый черновик в статусе 'sending' — txnId у sync-события нет.
const findPendingDraft = (items: TimelineItem[], incoming: MessageTimelineItem): number =>
  items.findIndex(
    (item) =>
      !isSystem(item) &&
      item.sendStatus === 'sending' &&
      item.sender === incoming.sender &&
      item.content.body === incoming.content.body,
  )

export function mergeTimeline(existing: TimelineItem[], incoming: TimelineItem[]): TimelineItem[] {
  let result = existing

  for (const incomingItem of incoming) {
    const dupIdx = result.findIndex((existing) => existing.eventId === incomingItem.eventId)
    if (dupIdx !== -1) {
      const existingItem = result[dupIdx]!
      if (existingItem.ts === incomingItem.ts) continue

      if (result === existing) result = [...existing]
      result[dupIdx] = { ...existingItem, ts: incomingItem.ts }
      continue
    }

    // копия на первое реальное изменение
    if (result === existing) result = [...existing]

    const pendingIdx = !isSystem(incomingItem) ? findPendingDraft(result, incomingItem) : -1
    const draft = result[pendingIdx]

    if (draft && !isSystem(draft)) {
      result[pendingIdx] = {
        ...draft,
        eventId: incomingItem.eventId,
        ts: incomingItem.ts,
        sendStatus: 'sent',
      }
    } else {
      result.push(incomingItem)
    }
  }

  return result
}
