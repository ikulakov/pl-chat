import { replyEventIdOf } from '../../domain/reply'
import { isMedia, type MediaContent, type MessageTimelineItem } from '../../domain/timeline'
import { MsgType } from '../consts'
import type { OutgoingContent, OutgoingMediaContent } from '../dto'

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

export function toOutgoingContent(message: MessageTimelineItem): OutgoingContent {
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
