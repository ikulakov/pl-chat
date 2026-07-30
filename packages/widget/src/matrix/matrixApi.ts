import type { MediaContent, MediaTimelineItem, TextTimelineItem } from '../domain/timeline'
import { MsgType } from './consts'
import type {
  MessagesResponse,
  OutgoingContent,
  RegisterResponse,
  SendEventResponse,
  SyncResponse,
  UploadResponse,
} from './dto'
import { Endpoints } from './endpoints'
import type { MatrixTransport, UploadOptions } from './transport/matrixTransport'
import type { RelatesTo } from './types'

// Размер страницы истории (limit для GET /messages). Лимит на сервере считает все
// события (m.room.member, m.reaction и т.п.), максимум сервера — 100.
const HISTORY_PAGE_SIZE = 50

// Окно long-poll: сервер держит /sync до этого времени, потом отвечает пустым батчем.
const SYNC_TIMEOUT_MS = 25_000

function relatesTo(replyToEventId: string | undefined): { 'm.relates_to'?: RelatesTo } {
  return replyToEventId ? { 'm.relates_to': { 'm.in_reply_to': { event_id: replyToEventId } } } : {}
}

interface SendMessageParams {
  roomId: string
  txnId: string
  content: TextTimelineItem['content']
  replyToEventId?: string | undefined
}

interface SendMediaMessageParams {
  roomId: string
  txnId: string
  kind: MediaTimelineItem['kind']
  content: MediaContent
  replyToEventId?: string | undefined
}

export function createMatrixApi(transport: MatrixTransport) {
  function sendRoomMessage(
    roomId: string,
    txnId: string,
    content: OutgoingContent,
  ): Promise<SendEventResponse> {
    return transport.request(Endpoints.SEND_MESSAGE({ roomId, txnId }), {
      method: 'PUT',
      body: content,
    })
  }

  return {
    registerGuest(): Promise<RegisterResponse> {
      return transport.request(Endpoints.REGISTER, {
        method: 'POST',
        body: {},
        searchParams: { kind: 'guest' },
      })
    },

    initialSync(): Promise<SyncResponse> {
      return transport.request(Endpoints.SYNC, {
        searchParams: { timeout: 0 },
      })
    },

    longPollSync(
      since: string,
      options?: { signal?: AbortSignal | undefined; timeoutMs?: number },
    ): Promise<SyncResponse> {
      return transport.request(Endpoints.SYNC, {
        searchParams: {
          timeout: options?.timeoutMs ?? SYNC_TIMEOUT_MS,
          since,
        },
        signal: options?.signal,
      })
    },

    getRoomHistory(roomId: string, from: string, signal?: AbortSignal): Promise<MessagesResponse> {
      return transport.request(Endpoints.LOAD_HISTORY({ roomId }), {
        searchParams: {
          dir: 'b',
          from,
          limit: HISTORY_PAGE_SIZE,
        },
        signal,
      })
    },

    sendMessage({
      roomId,
      txnId,
      content,
      replyToEventId,
    }: SendMessageParams): Promise<SendEventResponse> {
      return sendRoomMessage(roomId, txnId, {
        msgtype: MsgType.Text,
        body: content.body,
        ...relatesTo(replyToEventId),
      })
    },

    sendMediaMessage({
      kind,
      roomId,
      txnId,
      content,
      replyToEventId,
    }: SendMediaMessageParams): Promise<SendEventResponse> {
      return sendRoomMessage(roomId, txnId, {
        msgtype: kind === 'image' ? MsgType.Image : MsgType.File,
        ...content,
        body: content.body || content.filename,
        ...relatesTo(replyToEventId),
      })
    },

    uploadMedia(file: File, options?: UploadOptions): Promise<UploadResponse> {
      return transport.upload(Endpoints.UPLOAD_MEDIA, file, {
        ...options,
        searchParams: { filename: file.name },
      })
    },

    sendReadReceipt(roomId: string, eventId: string): Promise<Record<string, never>> {
      return transport.request(Endpoints.MARK_READ({ roomId, eventId }), {
        method: 'POST',
        body: {},
      })
    },
  }
}

export type MatrixApi = ReturnType<typeof createMatrixApi>
