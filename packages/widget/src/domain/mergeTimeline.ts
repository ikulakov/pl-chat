import { isSystem, type MessageTimelineItem, type SendStatus, type TimelineItem } from './timeline'

const isDraftOf = (
  item: TimelineItem,
  incoming: MessageTimelineItem,
  status: SendStatus,
): boolean =>
  !isSystem(item) &&
  item.sendStatus === status &&
  item.sender === incoming.sender &&
  item.content.body === incoming.content.body

function findDraftIndex(items: TimelineItem[], incoming: MessageTimelineItem): number {
  const sending = items.findIndex((item) => isDraftOf(item, incoming, 'sending'))
  if (sending !== -1) return sending

  return items.findIndex((item) => isDraftOf(item, incoming, 'failed'))
}

export function mergeTimeline(existing: TimelineItem[], incoming: TimelineItem[]): TimelineItem[] {
  let result = existing

  for (const incomingItem of incoming) {
    const dupIdx = result.findIndex((item) => item.eventId === incomingItem.eventId)
    if (dupIdx !== -1) {
      const duplicate = result[dupIdx]!
      if (duplicate.ts === incomingItem.ts) continue

      if (result === existing) result = [...existing]
      result[dupIdx] = { ...duplicate, ts: incomingItem.ts }
      continue
    }

    // копия на первое реальное изменение
    if (result === existing) result = [...existing]

    const draftIdx = !isSystem(incomingItem) ? findDraftIndex(result, incomingItem) : -1
    const draft = result[draftIdx]

    if (draft && !isSystem(draft)) {
      result[draftIdx] = {
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
