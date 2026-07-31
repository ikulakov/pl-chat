export type TimelineItemKind = 'text' | 'image' | 'file' | 'notice' | 'system'

export type SendStatus = 'sending' | 'sent' | 'failed'

export interface TimelineRelation {
  type: 'reply'
  eventId: string
}

interface BaseTimelineItem {
  // React key, якорь для optimistic-обновлений
  localId: string
  // id события в комнате от сервера; до ответа — placeholder `optimistic:{localId}`
  eventId: string
  // idempotency-ключ PUT /send — по нему mergeTimeline резолвит черновик в реальное событие.
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

export interface MediaInfo {
  mimetype: string
  size: number
  w?: number
  h?: number
}

export interface MediaContent {
  body: string
  // mxc://server/mediaId; у optimistic черновика пусто, пока файл не загрузился
  url: string
  filename: string
  info: MediaInfo
}

/**
 * Локальная обвязка исходящего медиа для optimistic черновиков — у событий с сервера её нет.
 */
export interface MediaUpload {
  file: File
  // проценты отдачи; null — загрузка не идёт (ошибка или уже загружено)
  pct: number | null
}

export interface ImageTimelineItem extends BaseTimelineItem {
  kind: 'image'
  content: MediaContent
  upload?: MediaUpload
}

export interface FileTimelineItem extends BaseTimelineItem {
  kind: 'file'
  content: MediaContent
  upload?: MediaUpload
}

export type MediaTimelineItem = ImageTimelineItem | FileTimelineItem

export interface SystemTimelineItem {
  kind: 'system' | 'notice'
  localId: string
  eventId: string
  ts: number
  content: { body: string }
}

export type MessageTimelineItem = TextTimelineItem | MediaTimelineItem

export type TimelineItem = MessageTimelineItem | SystemTimelineItem

export const isSystem = (item: TimelineItem): item is SystemTimelineItem =>
  item.kind === 'system' || item.kind === 'notice'

export const isMedia = (item: TimelineItem): item is MediaTimelineItem =>
  item.kind === 'image' || item.kind === 'file'
