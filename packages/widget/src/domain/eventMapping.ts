import { t } from '../i18n'
import { MatrixEventType, MsgType } from '../matrix/consts'
import type * as Matrix from '../matrix/types'
import type { TimelineItem, TimelineRelation } from './timeline'

function isRoomMessage(event: Matrix.ClientEvent): event is Matrix.RoomMessageEvent {
  return event.type === MatrixEventType.RoomMessage
}

function isOperatorJoined(event: Matrix.ClientEvent): event is Matrix.OperatorJoinedEvent {
  return event.type === MatrixEventType.OperatorJoined
}

function isOperatorLeft(event: Matrix.ClientEvent): event is Matrix.OperatorLeftEvent {
  return event.type === MatrixEventType.OperatorLeft
}

function operatorJoinedText(content: Matrix.OperatorJoinedEvent['content']): string {
  return content.role === 'bot'
    ? t('system.operatorJoinedBot')
    : t('system.operatorJoinedHuman', { name: content.displayname })
}

function operatorLeftText(reason: Matrix.OperatorLeftEvent['content']['reason']): string {
  switch (reason) {
    case 'completed':
      return t('system.operatorLeftCompleted')
    case 'transferred':
      return t('system.operatorLeftTransferred')
    case 'timeout':
      return t('system.operatorLeftTimeout')
  }
}

function toRelation(content: { 'm.relates_to'?: Matrix.RelatesTo }): TimelineRelation | undefined {
  const eventId = content['m.relates_to']?.['m.in_reply_to']?.event_id
  return eventId ? { type: 'reply', eventId } : undefined
}

function createPlaqueItem(
  kind: 'system' | 'notice',
  event: Matrix.ClientEvent,
  body: string,
): TimelineItem {
  return {
    kind,
    localId: event.event_id,
    eventId: event.event_id,
    ts: event.origin_server_ts,
    content: { body },
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
  }
}

function roomMessageToItem(event: Matrix.RoomMessageEvent): TimelineItem | undefined {
  switch (event.content.msgtype) {
    case MsgType.Notice:
      return createPlaqueItem('notice', event, event.content.body)
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
    return createPlaqueItem('system', event, operatorJoinedText(event.content))
  }
  if (isOperatorLeft(event)) {
    return createPlaqueItem('system', event, operatorLeftText(event.content.reason))
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
