export type TimelineItemKind = 'text' | 'notice' | 'system'

export type SendStatus = 'sending' | 'sent' | 'failed'

export interface TimelineRelation {
  type: 'reply' | 'reference'
  eventId: string
}

interface BaseTimelineItem {
  // React key, якорь для optimistic-обновлений
  localId: string
  // id события в комнате от сервера; до ответа — placeholder `optimistic:{localId}`
  eventId: string
  // idempotency-ключ PUT /send; сейчас только у optimistic-item'ов
  txnId?: string
  sender: string
  ts: number
  sendStatus: SendStatus
  relation?: TimelineRelation
}

export interface TextTimelineItem extends BaseTimelineItem {
  kind: 'text'
  content: { body: string }
}

export interface SystemTimelineItem {
  kind: 'system' | 'notice'
  localId: string
  eventId: string
  ts: number
  content: { body: string }
}

export type MessageTimelineItem = TextTimelineItem

export type TimelineItem = MessageTimelineItem | SystemTimelineItem

export const isSystem = (item: TimelineItem): item is SystemTimelineItem =>
  item.kind === 'system' || item.kind === 'notice'
