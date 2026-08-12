import type { CardAction } from '../../domain/adaptiveCards'
import { replyEventIdOf } from '../../domain/reply'
import {
  isMedia,
  type MediaContent,
  type MediaTimelineItem,
  type TextTimelineItem,
} from '../../domain/timeline'
import { MsgType } from '../wire/consts'
import type {
  OutgoingAdaptiveActionContent,
  OutgoingMediaContent,
  OutgoingTextContent,
} from '../wire/dto'

export type OutgoingTimelineItem = TextTimelineItem | MediaTimelineItem

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
): OutgoingTextContent | OutgoingMediaContent {
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
