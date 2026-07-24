import { isSystem, type MessageTimelineItem, type TimelineItem } from '../../domain/timeline'
import { t } from '../../i18n'
import { formatDateLabel, startOfDay } from '../../shared/formatDate'
import type { BubblePosition } from './MessageBubble'

interface DayGroup {
  key: string
  label: string
  items: TimelineItem[]
}

export function flashHighlight(row: HTMLElement, className: string | undefined): void {
  if (!className) return

  row.classList.remove(className)
  void row.offsetWidth
  row.classList.add(className)
  row.addEventListener('animationend', () => row.classList.remove(className), { once: true })
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

export function indexMessagesByEventId(timeline: TimelineItem[]): Map<string, MessageTimelineItem> {
  const index = new Map<string, MessageTimelineItem>()

  for (const item of timeline) {
    if (!isSystem(item)) index.set(item.eventId, item)
  }

  return index
}

export interface QuotedPreview {
  author?: string
  text: string
  targetId?: string
}

interface GetQuotePreviewParams {
  index: Map<string, MessageTimelineItem>
  message: MessageTimelineItem
  userId: string
  operatorName: string
}

export function getQuotePreview({
  index,
  message,
  userId,
  operatorName,
}: GetQuotePreviewParams): QuotedPreview | undefined {
  if (message.relation?.type !== 'reply') return

  // цитата резолвится только из загруженной ленты
  const parent = index.get(message.relation.eventId)

  // пустой body — это отредактированное сообщение: бэкенд вычищает content при редакции,
  // для пользователя оно так же недоступно, как и не загруженное
  if (!parent || parent.content.body.trim() === '') {
    return { text: t('chat.reply.unavailable') }
  }

  return {
    author: parent.sender === userId ? t('chat.reply.you') : operatorName,
    text: parent.content.body,
    targetId: parent.localId,
  }
}
