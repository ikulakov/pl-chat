import type { EventId } from '@/shared/types/ids'
import { isSystem, type MessageTimelineItem, type TimelineItem } from '@/domain/timeline'
import { formatDateLabel, startOfDay } from '@/shared/utils/formatDate'
import type { MessageGroupPosition } from '../../MessageRow'

interface DayGroup {
  key: string
  label: string
  items: TimelineItem[]
}

export function groupTimelineByDate(timeline: TimelineItem[]): DayGroup[] {
  const groups: DayGroup[] = []

  for (const item of timeline) {
    const day = startOfDay(item.ts)
    const key = `date-${day}`
    const lastGroup = groups.at(-1)

    if (lastGroup?.key === key) {
      lastGroup.items.push(item)
    } else {
      groups.push({ key, label: formatDateLabel(item.ts), items: [item] })
    }
  }

  return groups
}

export function getPosition(
  prev: TimelineItem | undefined,
  current: MessageTimelineItem,
  next: TimelineItem | undefined,
): MessageGroupPosition {
  const isSameSender = (item?: TimelineItem): boolean =>
    item !== undefined && !isSystem(item) && item.sender === current.sender

  const prevSameSender = isSameSender(prev)
  const nextSameSender = isSameSender(next)

  if (!prevSameSender && !nextSameSender) return 'single'
  if (!prevSameSender && nextSameSender) return 'first'
  if (prevSameSender && nextSameSender) return 'middle'
  return 'last'
}

export function indexMessagesByEventId(
  timeline: TimelineItem[],
): Map<EventId, MessageTimelineItem> {
  const index = new Map<EventId, MessageTimelineItem>()

  for (const item of timeline) {
    if (!isSystem(item)) index.set(item.eventId, item)
  }

  return index
}
