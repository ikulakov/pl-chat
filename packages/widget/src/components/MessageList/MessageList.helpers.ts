import { isSystem, type MessageTimelineItem, type TimelineItem } from '../../domain/timeline'
import { formatDateLabel, startOfDay } from '../../shared/formatDate'
import type { BubblePosition } from './MessageBubble'

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
): BubblePosition {
  const isSameSender = (item?: TimelineItem): boolean =>
    item !== undefined && !isSystem(item) && item.sender === current.sender

  const prevSameSender = isSameSender(prev)
  const nextSameSender = isSameSender(next)

  if (!prevSameSender && !nextSameSender) return 'single'
  if (!prevSameSender && nextSameSender) return 'first'
  if (prevSameSender && nextSameSender) return 'middle'
  return 'last'
}

export function copyText(text: string): void {
  if (!navigator.clipboard?.writeText) {
    console.warn('[PLChat] clipboard API unavailable — copy skipped')
    return
  }
  navigator.clipboard.writeText(text).catch((err: unknown) => {
    console.warn('[PLChat] clipboard write failed:', err)
  })
}
