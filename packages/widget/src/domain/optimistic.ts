import { isPreviewableImage, resolveMimeType } from '../shared/fileValidation'
import type {
  MediaTimelineItem,
  MediaUpload,
  MessageTimelineItem,
  TextTimelineItem,
} from './timeline'

const OPTIMISTIC_PREFIX = 'optimistic:'

export function isOptimistic(eventId: string): boolean {
  return eventId.startsWith(OPTIMISTIC_PREFIX)
}

interface Outgoing<M extends MessageTimelineItem> {
  message: M
  txnId: string
}

interface CreateOptimisticParams<M extends MessageTimelineItem> {
  sender: string
  replyToEventId: string | undefined
  fields: Pick<M, 'kind' | 'content'> & Partial<Omit<M, 'relation'>>
}

function createOptimistic<M extends MessageTimelineItem>({
  sender,
  replyToEventId,
  fields,
}: CreateOptimisticParams<M>): Outgoing<M> {
  const localId = crypto.randomUUID()
  const txnId = crypto.randomUUID()

  return {
    message: {
      localId,
      eventId: `${OPTIMISTIC_PREFIX}${localId}`,
      txnId,
      ts: Date.now(),
      sendStatus: 'sending',
      sender,
      ...fields,
      ...(replyToEventId ? { relation: { type: 'reply', eventId: replyToEventId } } : {}),
    } as M,
    txnId,
  }
}

interface CreateOptimisticTextMessageParams {
  sender: string
  text: string
  replyToEventId?: string | undefined
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

interface CreateOptimisticMediaMessageParams {
  sender: string
  file: File
  caption?: string | undefined
  dims?: { w: number; h: number } | null
  replyToEventId?: string | undefined
}

export function createOptimisticMediaMessage({
  sender,
  file,
  caption,
  dims = null,
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
