import type { CardAction } from '../../domain/adaptiveCards'
import { replyEventIdOf } from '../../domain/reply'
import {
  isMedia,
  isSticker,
  type MediaContent,
  type MediaTimelineItem,
  type StickerTimelineItem,
  type TextTimelineItem,
} from '../../domain/timeline'
import { MatrixEventType, MsgType } from '../wire/consts'
import type {
  OutgoingAdaptiveActionContent,
  OutgoingMediaContent,
  OutgoingStickerContent,
  OutgoingTextContent,
} from '../wire/dto'

export type OutgoingTimelineItem = TextTimelineItem | MediaTimelineItem | StickerTimelineItem

/** Тип события в URL отправки. У стикера свой, у всего остального — `m.room.message`. */
export function outgoingEventType(message: OutgoingTimelineItem): string {
  return isSticker(message) ? MatrixEventType.Sticker : MatrixEventType.RoomMessage
}

function toMediaContent(content: MediaContent): Omit<OutgoingMediaContent, 'msgtype'> {
  const { body, url, filename, info } = content

  return {
    body: body || filename,
    url,
    filename,
    info: {
      mimetype: info.mimetype,
      size: info.size,
      ...(info.w !== undefined ? { w: info.w } : {}),
      ...(info.h !== undefined ? { h: info.h } : {}),
    },
  }
}

export function toMessageContent(
  message: OutgoingTimelineItem,
): OutgoingTextContent | OutgoingMediaContent | OutgoingStickerContent {
  // Стикер — до вычисления связи: `m.sticker` её не переносит, бэкенд поле молча отбросит.
  if (isSticker(message)) {
    const { body, url, info } = message.content
    return { body, url, info }
  }

  const replyId = replyEventIdOf(message)
  const relation = replyId ? { 'm.relates_to': { 'm.in_reply_to': { event_id: replyId } } } : {}

  if (isMedia(message)) {
    return {
      msgtype: message.kind === 'image' ? MsgType.Image : MsgType.File,
      ...toMediaContent(message.content),
      ...relation,
    }
  }
  return { msgtype: MsgType.Text, body: message.content.body, ...relation }
}

export function toAdaptiveActionContent(
  cardEventId: string,
  action: CardAction,
): OutgoingAdaptiveActionContent {
  return {
    msgtype: MsgType.AdaptiveAction,
    body: `[action: ${action.id}]`,
    adaptive_action: {
      action_id: action.id,
      source_event_id: cardEventId,
      data: action.data ?? {},
    },
    'm.relates_to': { rel_type: 'm.reference', event_id: cardEventId },
  }
}
