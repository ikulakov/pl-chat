import type { MediaMessageContent, TextMessageContent, WithRelation } from './types'

export function createReplyRelation(replyToEventId: string | undefined): WithRelation {
  return replyToEventId ? { 'm.relates_to': { 'm.in_reply_to': { event_id: replyToEventId } } } : {}
}

export function getReplyEventId(
  content: TextMessageContent | MediaMessageContent,
): string | undefined {
  return content['m.relates_to']?.['m.in_reply_to']?.event_id
}
