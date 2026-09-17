import { isPreviewableImage, resolveMimeType } from '@/shared/utils/fileValidation'
import type { ImageDimensions } from '@/shared/utils/imageDimensions'
import type { StickerItem } from './emoji'
import type { EventId, LocalId, TxnId, UserId } from './ids'
import type {
  MediaTimelineItem,
  MediaUpload,
  MessageTimelineItem,
  StickerTimelineItem,
  TextTimelineItem,
} from './timeline'

const OPTIMISTIC_PREFIX = 'optimistic:'

export function isOptimistic(eventId: EventId): boolean {
  return eventId.startsWith(OPTIMISTIC_PREFIX)
}

/** Черновик всегда отправляется, поэтому ключ идемпотентности у него есть всегда. */
type Outgoing<M extends MessageTimelineItem> = M & { txnId: TxnId }

interface CreateOptimisticParams<M extends MessageTimelineItem> {
  sender: UserId
  replyToEventId: EventId | undefined
  fields: Pick<M, 'kind' | 'content'> & Partial<Omit<M, 'relation'>>
}

function createOptimistic<M extends MessageTimelineItem>({
  sender,
  replyToEventId,
  fields,
}: CreateOptimisticParams<M>): Outgoing<M> {
  const localId: LocalId = crypto.randomUUID()
  const txnId: TxnId = crypto.randomUUID()

  return {
    localId,
    eventId: `${OPTIMISTIC_PREFIX}${localId}`,
    txnId,
    ts: Date.now(),
    sendStatus: 'sending',
    sender,
    ...fields,
    ...(replyToEventId ? { relation: { type: 'reply', eventId: replyToEventId } } : {}),
  } as Outgoing<M>
}

interface CreateOptimisticTextMessageParams {
  sender: UserId
  text: string
  replyToEventId?: EventId | undefined
}

export function createOptimisticTextMessage({
  sender,
  text,
  replyToEventId,
}: CreateOptimisticTextMessageParams): Outgoing<TextTimelineItem> {
  return createOptimistic<TextTimelineItem>({
    sender,
    replyToEventId,
    fields: { kind: 'text', content: { body: text } },
  })
}

interface CreateOptimisticStickerMessageParams {
  sender: UserId
  sticker: StickerItem
}

/**
 * Стикер уже лежит на сервере, поэтому загрузки нет и черновик сразу «полный».
 * `replyToEventId` не принимается сознательно: `m.sticker` не переносит связь ответа —
 * бэкенд её отбрасывает (см. RoomStickerContentDto).
 */
export function createOptimisticStickerMessage({
  sender,
  sticker,
}: CreateOptimisticStickerMessageParams): Outgoing<StickerTimelineItem> {
  return createOptimistic<StickerTimelineItem>({
    sender,
    replyToEventId: undefined,
    fields: {
      kind: 'sticker',
      content: {
        body: sticker.body,
        url: sticker.url,
        info: { ...sticker.info, size: sticker.info.size ?? 0 },
        format: sticker.format,
        media: { mediaId: sticker.mediaId, bytesUrl: sticker.bytesUrl },
      },
    },
  })
}

interface CreateOptimisticMediaMessageParams {
  sender: UserId
  file: File
  caption?: string | undefined
  dims?: ImageDimensions | undefined
  replyToEventId?: EventId | undefined
}

export function createOptimisticMediaMessage({
  sender,
  file,
  caption,
  dims,
  replyToEventId,
}: CreateOptimisticMediaMessageParams): Outgoing<MediaTimelineItem> {
  const upload: MediaUpload = { file, pct: 0 }

  return createOptimistic<MediaTimelineItem>({
    sender,
    replyToEventId,
    fields: {
      kind: isPreviewableImage(file) ? 'image' : 'file',
      content: {
        body: caption?.trim() ?? '',
        url: '',
        filename: file.name,
        info: {
          mimetype: resolveMimeType(file),
          size: file.size,
          ...(dims ? { w: dims.w, h: dims.h } : {}),
        },
      },
      upload,
    },
  })
}
