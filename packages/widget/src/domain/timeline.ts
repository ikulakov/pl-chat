import type { SystemMessageKey } from '../i18n'
import type { AdaptiveCardPayload } from './adaptiveCards'
import type { UploadFailure } from './uploadError'

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
  error?: UploadFailure
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

/**
 * Стикер из server-managed каталога. Сознательно НЕ входит в `MediaTimelineItem`: у него нет
 * ни загрузки, ни имени файла, ни вердикта проверки, а байты лежат за публичным адресом без
 * токена. Так стикер даром не попадает в ветки медиа — ни в редьюсере, ни в `useMediaUploadView`,
 * ни в фолбэке имени файла для цитаты.
 */
export interface StickerTimelineItem extends BaseTimelineItem {
  kind: 'sticker'
  content: {
    /** Эмодзи-подпись: показываем как alt и как текст цитаты. */
    body: string
    url: string
    info: MediaInfo
  }
}

export interface AdaptiveCardTimelineItem extends BaseTimelineItem {
  kind: 'adaptiveCard'
  content: {
    body: string
    card: AdaptiveCardPayload
    cardKind?: string
  }
}

export type SystemLabel =
  | { source: 'literal'; body: string }
  | { source: 'i18n'; key: SystemMessageKey; params?: Record<string, string> }

export interface SystemTimelineItem {
  kind: 'system' | 'notice'
  localId: string
  eventId: string
  ts: number
  label: SystemLabel
}

export type MessageTimelineItem =
  | TextTimelineItem
  | MediaTimelineItem
  | AdaptiveCardTimelineItem
  | StickerTimelineItem

export type TimelineItem = MessageTimelineItem | SystemTimelineItem

export const isSystem = (item: TimelineItem): item is SystemTimelineItem =>
  item.kind === 'system' || item.kind === 'notice'

export const isMedia = (item: TimelineItem): item is MediaTimelineItem =>
  item.kind === 'image' || item.kind === 'file'

export const isAdaptiveCard = (item: TimelineItem): item is AdaptiveCardTimelineItem =>
  item.kind === 'adaptiveCard'

export const isSticker = (item: TimelineItem): item is StickerTimelineItem =>
  item.kind === 'sticker'
