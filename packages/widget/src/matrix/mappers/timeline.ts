import { isAdaptiveCardPayload } from '../../domain/adaptiveCards'
import type { SystemLabel, TimelineItem, TimelineRelation } from '../../domain/timeline'
import { MsgType } from '../wire/consts'
import { isOperatorJoined, isOperatorLeft, isRoomMessage } from '../wire/guards'
import type * as Matrix from '../wire/types'

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

function toRelation(content: Matrix.WithRelation): TimelineRelation | undefined {
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

function messageBaseFields(event: Matrix.RoomMessageEvent, content: Matrix.WithRelation) {
  const relation = toRelation(content)

  return {
    localId: event.event_id,
    eventId: event.event_id,
    sender: event.sender,
    ts: event.origin_server_ts,
    sendStatus: 'sent' as const,
    ...(event.unsigned?.transaction_id ? { txnId: event.unsigned.transaction_id } : {}),
    ...(relation ? { relation } : {}),
  }
}

function createTextItem(
  event: Matrix.RoomMessageEvent,
  content: Matrix.TextMessageContent,
): TimelineItem {
  return {
    ...messageBaseFields(event, content),
    kind: 'text',
    content: { body: content.body },
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
    ...messageBaseFields(event, content),
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

function createAdaptiveCardItem(
  event: Matrix.RoomMessageEvent,
  content: Matrix.AdaptiveCardMessageContent,
): TimelineItem {
  // Битый payload карточки не роняет сообщение — деградируем в текст
  if (!isAdaptiveCardPayload(content.adaptive_card)) {
    return {
      ...messageBaseFields(event, content),
      kind: 'text',
      content: { body: content.body },
    }
  }

  return {
    ...messageBaseFields(event, content),
    kind: 'adaptiveCard',
    content: {
      body: content.body,
      card: content.adaptive_card,
      ...(content.card_kind ? { cardKind: content.card_kind } : {}),
    },
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
    case MsgType.AdaptiveCard:
      return createAdaptiveCardItem(event, event.content)
    case MsgType.AdaptiveAction:
      // Ответ клиента на карточку в ленте не рисуем
      return undefined
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
