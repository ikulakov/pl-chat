import type {
  MessagesResponse,
  OutgoingContent,
  RegisterResponse,
  SendEventResponse,
  SyncResponse,
  UploadResponse,
} from '../wire/dto'
import { Endpoints } from './endpoints'
import type { MatrixTransport, UploadOptions } from './matrixTransport'

// Размер страницы истории (limit для GET /messages). Лимит на сервере считает все
// события (m.room.member, m.reaction и т.п.), максимум сервера — 100.
const HISTORY_PAGE_SIZE = 50

// Окно long-poll: сервер держит /sync до этого времени, потом отвечает пустым батчем.
const SYNC_TIMEOUT_MS = 25_000

interface SendMessageParams {
  roomId: string
  txnId: string
  content: OutgoingContent
}

export function createMatrixApi(transport: MatrixTransport) {
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

    sendMessage({ roomId, txnId, content }: SendMessageParams): Promise<SendEventResponse> {
      return transport.request(Endpoints.SEND_MESSAGE({ roomId, txnId }), {
        method: 'PUT',
        body: content,
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
