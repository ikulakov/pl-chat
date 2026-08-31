import {
  replyAuthorLabel,
  replyEventIdOf,
  replyStickerOf,
  replyText,
  type ReplyStickerPreview,
} from '../../domain/reply'
import { isSystem, type MessageTimelineItem, type TimelineItem } from '../../domain/timeline'
import { t } from '../../i18n'
import { formatDateLabel, startOfDay } from '../../shared/utils/formatDate'
import type { BubblePosition } from './MessageRow/MessageBubble'

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

export interface ReplyPreviewData {
  author?: string
  text: string
  targetId?: string
  sticker?: ReplyStickerPreview
}

interface GetReplyPreviewParams {
  index: Map<string, MessageTimelineItem>
  message: MessageTimelineItem
  userId: string
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
  const text = parent ? replyText(parent) : ''

  // нечего показать (отредактированное/вычищенное сообщение) — то же, что не загруженное
  if (!parent || text === '') {
    return { text: t('chat.reply.unavailable') }
  }

  const sticker = replyStickerOf(parent)

  return {
    author: replyAuthorLabel(parent.sender, userId),
    text,
    targetId: parent.localId,
    ...(sticker ? { sticker } : {}),
  }
}
