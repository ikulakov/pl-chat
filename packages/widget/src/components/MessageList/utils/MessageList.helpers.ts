import type { EventId, LocalId, UserId } from '@/shared/types/ids'
import { replyEventIdOf, replyQuoteOf, type ReplyStickerPreview } from '@/domain/reply'
import { isSystem, type MessageTimelineItem, type TimelineItem } from '@/domain/timeline'
import { t } from '@/i18n'
import { formatDateLabel, startOfDay } from '@/shared/utils/formatDate'
import { replyAuthorLabel, replyQuoteView } from '../../ReplyPreview'
import type { BubblePosition } from '../MessageRow'

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

export function indexMessagesByEventId(
  timeline: TimelineItem[],
): Map<EventId, MessageTimelineItem> {
  const index = new Map<EventId, MessageTimelineItem>()

  for (const item of timeline) {
    if (!isSystem(item)) index.set(item.eventId, item)
  }

  return index
}

export interface ReplyPreviewData {
  author?: string
  text: string
  targetId?: LocalId
  sticker?: ReplyStickerPreview
}

interface GetReplyPreviewParams {
  index: Map<EventId, MessageTimelineItem>
  message: MessageTimelineItem
  userId: UserId
}

export function getReplyPreview({
  index,
  message,
  userId,
}: GetReplyPreviewParams): ReplyPreviewData | undefined {
  const parentId = replyEventIdOf(message)
  if (!parentId) return

  // цитата резолвится только из загруженной ленты
  const parent = index.get(parentId)
  const quote = parent ? replyQuoteOf(parent) : undefined

  // нечего показать (отредактированное/вычищенное сообщение) — то же, что не загруженное
  if (!parent || !quote) {
    return { text: t('chat.reply.unavailable') }
  }

  return {
    author: replyAuthorLabel(parent.sender, userId),
    targetId: parent.localId,
    ...replyQuoteView(quote),
  }
}
