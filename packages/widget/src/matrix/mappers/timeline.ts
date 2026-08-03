import type { SystemLabel, TimelineItem, TimelineRelation } from '../../domain/timeline'
import { MsgType } from '../consts'
import { isOperatorJoined, isOperatorLeft, isRoomMessage } from '../eventGuards'
import type * as Matrix from '../types'

function operatorJoinedLabel(content: Matrix.OperatorJoinedEvent['content']): SystemLabel {
  return content.role === 'bot'
    ? { source: 'i18n', key: 'system.operatorJoinedBot' }
    : { source: 'i18n', key: 'system.operatorJoinedHuman', params: { name: content.displayname } }
}

function operatorLeftLabel(reason: Matrix.OperatorLeftEvent['content']['reason']): SystemLabel {
  switch (reason) {
    case 'completed':
      return { source: 'i18n', key: 'system.operatorLeftCompleted' }
    case 'transferred':
      return { source: 'i18n', key: 'system.operatorLeftTransferred' }
    case 'timeout':
      return { source: 'i18n', key: 'system.operatorLeftTimeout' }
  }
}

function toRelation(
  content: Matrix.TextMessageContent | Matrix.MediaMessageContent,
): TimelineRelation | undefined {
  const eventId = content['m.relates_to']?.['m.in_reply_to']?.event_id
  return eventId ? { type: 'reply', eventId } : undefined
}

function createPlaqueItem(
  kind: 'system' | 'notice',
  event: Matrix.ClientEvent,
  label: SystemLabel,
): TimelineItem {
  return {
    kind,
    localId: event.event_id,
    eventId: event.event_id,
    ts: event.origin_server_ts,
    label,
  }
}

function messageBaseFields(event: Matrix.RoomMessageEvent) {
  return {
    localId: event.event_id,
    eventId: event.event_id,
    sender: event.sender,
    ts: event.origin_server_ts,
    sendStatus: 'sent' as const,
    ...(event.unsigned?.transaction_id ? { txnId: event.unsigned.transaction_id } : {}),
  }
}

function createTextItem(
  event: Matrix.RoomMessageEvent,
  content: Matrix.TextMessageContent,
): TimelineItem {
  const relation = toRelation(content)

  return {
    ...messageBaseFields(event),
    kind: 'text',
    content: { body: content.body },
    ...(relation ? { relation } : {}),
  }
}

function createMediaItem(
  kind: 'image' | 'file',
  event: Matrix.RoomMessageEvent,
  content: Matrix.MediaMessageContent,
): TimelineItem {
  const { body, url, filename: rawFilename, info } = content
  const relation = toRelation(content)

  const filename = rawFilename ?? body
  const caption = body !== filename ? body : ''

  return {
    ...messageBaseFields(event),
    kind,
    content: {
      body: caption,
      url,
      filename,
      info: {
        mimetype: info?.mimetype ?? 'application/octet-stream',
        size: info?.size ?? 0,
        ...(info?.w ? { w: info.w } : {}),
        ...(info?.h ? { h: info.h } : {}),
      },
    },
    ...(relation ? { relation } : {}),
  }
}

function roomMessageToItem(event: Matrix.RoomMessageEvent): TimelineItem | undefined {
  switch (event.content.msgtype) {
    case MsgType.Notice:
      return createPlaqueItem('notice', event, { source: 'literal', body: event.content.body })
    case MsgType.Text:
      return createTextItem(event, event.content)
    case MsgType.Image:
      return createMediaItem('image', event, event.content)
    case MsgType.File:
      return createMediaItem('file', event, event.content)
    default:
      return undefined
  }
}

function eventToItem(event: Matrix.ClientEvent): TimelineItem | undefined {
  if (isRoomMessage(event)) {
    return roomMessageToItem(event)
  }
  if (isOperatorJoined(event)) {
    return createPlaqueItem('system', event, operatorJoinedLabel(event.content))
  }
  if (isOperatorLeft(event)) {
    return createPlaqueItem('system', event, operatorLeftLabel(event.content.reason))
  }

  return undefined
}

/**
 * Преобразует сырые события Matrix (timeline/state из sync) в доменные элементы ленты.
 * События без соответствия (неизвестный тип или msgtype) отбрасываются.
 */
export function timelineEventsToItems(events: Matrix.ClientEvent[] = []): TimelineItem[] {
  const result: TimelineItem[] = []

  for (const event of events) {
    const item = eventToItem(event)
    if (item) result.push(item)
  }

  return result
}
