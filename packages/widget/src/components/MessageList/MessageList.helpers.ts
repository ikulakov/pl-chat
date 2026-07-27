import { quoteAuthorLabel } from '../../domain/quote'
import {
  hasBody,
  isSystem,
  type MessageTimelineItem,
  type TimelineItem,
} from '../../domain/timeline'
import { t } from '../../i18n'
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

  // пустой body (отредактированное/вычищенное сообщение) недоступно так же, как не загруженное
  if (!parent || !hasBody(parent)) {
    return { text: t('chat.reply.unavailable') }
  }

  return {
    author: quoteAuthorLabel(parent.sender, userId, operatorName),
    text: parent.content.body,
    targetId: parent.localId,
  }
}
