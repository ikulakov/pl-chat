import { t } from '../i18n'
import { MatrixEventType, MsgType } from '../matrix/consts'
import type {
  ClientEvent,
  OperatorJoinedEvent,
  OperatorLeftEvent,
  RoomMessageEvent,
} from '../matrix/types'
import type { TimelineItem } from './timeline'

function isRoomMessage(event: ClientEvent): event is RoomMessageEvent {
  return event.type === MatrixEventType.RoomMessage
}

function isOperatorJoined(event: ClientEvent): event is OperatorJoinedEvent {
  return event.type === MatrixEventType.OperatorJoined
}

function isOperatorLeft(event: ClientEvent): event is OperatorLeftEvent {
  return event.type === MatrixEventType.OperatorLeft
}

function operatorLeftText(reason: OperatorLeftEvent['content']['reason']): string {
  switch (reason) {
    case 'completed':
      return t('system.operatorLeftCompleted')
    case 'transferred':
      return t('system.operatorLeftTransferred')
    case 'timeout':
      return t('system.operatorLeftTimeout')
  }
}

function createPlaqueItem(
  kind: 'system' | 'notice',
  event: ClientEvent,
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

function eventToItem(event: ClientEvent): TimelineItem | undefined {
  if (isRoomMessage(event)) {
    if (event.content.msgtype === MsgType.Notice) {
      return createPlaqueItem('notice', event, event.content.body)
    }
    if (event.content.msgtype === MsgType.Text) {
      return {
        kind: 'text',
        localId: event.event_id,
        eventId: event.event_id,
        sender: event.sender,
        ts: event.origin_server_ts,
        sendStatus: 'sent',
        content: { body: event.content.body },
      }
    }
    return undefined
  }

  if (isOperatorJoined(event)) {
    const body =
      event.content.role === 'bot'
        ? t('system.operatorJoinedBot')
        : t('system.operatorJoinedHuman', { name: event.content.displayname })

    return createPlaqueItem('system', event, body)
  }

  if (isOperatorLeft(event)) {
    return createPlaqueItem('system', event, operatorLeftText(event.content.reason))
  }

  return undefined
}

export function timelineEventsToItems(events: ClientEvent[] = []): TimelineItem[] {
  const result: TimelineItem[] = []

  for (const event of events) {
    const item = eventToItem(event)
    if (item) result.push(item)
  }

  return result
}
