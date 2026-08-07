import { isSystem, type TimelineItem } from './timeline'

function findDraftIndex(items: TimelineItem[], incoming: TimelineItem): number {
  if (isSystem(incoming) || !incoming.txnId) return -1

  return items.findIndex(
    (item) =>
      !isSystem(item) &&
      (item.sendStatus === 'sending' || item.sendStatus === 'failed') &&
      item.txnId === incoming.txnId,
  )
}

export function prependTimeline(existing: TimelineItem[], older: TimelineItem[]): TimelineItem[] {
  const knownEventIds = new Set(existing.map((item) => item.eventId))
  const fresh = older.filter((item) => !knownEventIds.has(item.eventId))

  if (fresh.length === 0) return existing

  return [...fresh, ...existing]
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

    const draftIdx = findDraftIndex(result, incomingItem)
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
