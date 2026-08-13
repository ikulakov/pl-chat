import type { EmojiAnimation } from '../../domain/emoji'
import type { ParsedMxcUrl } from '../../shared/utils/mxc'
import { RelType } from '../wire/consts'
import type {
  MessagesResponse,
  OutgoingContent,
  OutgoingReactionContent,
  OutgoingRedactionContent,
  RegisterResponse,
  SendEventResponse,
  SyncResponse,
  UploadResponse,
} from '../wire/dto'
import type {
  EmojiCategoriesResponse,
  EmojiCategoryWire,
  EmojiPacksResponse,
  StickerPacksResponse,
} from '../wire/emoji'
import { Endpoints } from './endpoints'
import type { MatrixTransport, UploadOptions } from './matrixTransport'

// Размер страницы истории (limit для GET /messages). Лимит на сервере считает все
// события (m.room.member, m.reaction и т.п.), максимум сервера — 100.
const HISTORY_PAGE_SIZE = 50

// Окно long-poll: сервер держит /sync до этого времени, потом отвечает пустым батчем.
const SYNC_TIMEOUT_MS = 25_000

// Дедлайн запросов эмодзи. Обязателен, потому что их промисы мемоизируются в кэшах, живущих
// всю сессию (lottieCache, emojiBitmap, защёлка emojiIndex): зависший запрос без отказа
// оставил бы там мёртвый промис навсегда, и повтор возвращал бы его же — ровно то, ради чего
// таймаут стоит в transport.download().
const EMOJI_TIMEOUT_MS = 30_000
const emojiDeadline = () => AbortSignal.timeout(EMOJI_TIMEOUT_MS)

export interface ThumbnailSize {
  width: number
  height: number
}

interface SendMessageParams {
  roomId: string
  txnId: string
  /** `m.room.message` для текста и медиа, `m.sticker` для стикера. */
  eventType: string
  content: OutgoingContent
}

interface SendReactionParams {
  roomId: string
  txnId: string
  targetEventId: string
  key: string
}

interface RedactEventParams {
  roomId: string
  txnId: string
  eventId: string
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

    sendMessage({
      roomId,
      txnId,
      eventType,
      content,
    }: SendMessageParams): Promise<SendEventResponse> {
      return transport.request(Endpoints.SEND_EVENT({ roomId, eventType, txnId }), {
        method: 'PUT',
        body: content,
      })
    },

    sendReaction({
      roomId,
      txnId,
      targetEventId,
      key,
    }: SendReactionParams): Promise<SendEventResponse> {
      const content: OutgoingReactionContent = {
        'm.relates_to': { rel_type: RelType.Annotation, event_id: targetEventId, key },
      }

      return transport.request(Endpoints.SEND_REACTION({ roomId, txnId }), {
        method: 'PUT',
        body: content,
      })
    },

    // Снятие реакции — редакция самого события реакции; сообщения клиент не редактирует.
    redactEvent({ roomId, txnId, eventId }: RedactEventParams): Promise<SendEventResponse> {
      const content: OutgoingRedactionContent = { redacts: eventId }

      return transport.request(Endpoints.SEND_REDACTION({ roomId, txnId }), {
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

    downloadMedia({ mediaId, serverName }: ParsedMxcUrl): Promise<Blob> {
      return transport.download(Endpoints.DOWNLOAD_MEDIA({ mediaId, serverName }))
    },

    getThumbnail(
      { mediaId, serverName }: ParsedMxcUrl,
      { width, height }: ThumbnailSize,
    ): Promise<Blob> {
      return transport.download(Endpoints.THUMBNAIL_MEDIA({ mediaId, serverName }), {
        searchParams: { width, height, method: 'scale' },
      })
    },

    getEmojiCategories(): Promise<EmojiCategoriesResponse> {
      return transport.request(Endpoints.EMOJI_CATEGORIES, { signal: emojiDeadline() })
    },

    getEmojiCategory(categoryId: string): Promise<EmojiCategoryWire> {
      return transport.request(Endpoints.EMOJI_CATEGORY({ categoryId }), {
        signal: emojiDeadline(),
      })
    },

    /** Весь пак разом: по нему лента строит индекс «символ → codepoint». */
    getEmojiPacks(): Promise<EmojiPacksResponse> {
      return transport.request(Endpoints.EMOJI_PACKS, { signal: emojiDeadline() })
    },

    /**
     * Байты анимации. `.tgs` — это gzip, и он отдаётся с `Content-Encoding: gzip`: браузер
     * разжимает сам, на выходе готовый JSON. Распаковывать ничего не нужно.
     * `v` — cache-buster: без него после переseed'а пака клиент неделю получал бы из
     * immutable-кэша старую анимацию.
     */
    getEmojiAnimation(codepoint: string, version: string): Promise<EmojiAnimation> {
      return transport.request(Endpoints.EMOJI_LOTTIE({ codepoint }), {
        searchParams: { v: version },
        signal: emojiDeadline(),
      })
    },

    getStickerPacks(): Promise<StickerPacksResponse> {
      return transport.request(Endpoints.STICKER_PACKS, { signal: emojiDeadline() })
    },

    /**
     * Байты Lottie-стикера. Тот же публичный маршрут, что и у растровых: `.tgs` отдаётся с
     * `Content-Encoding: gzip`, браузер разжимает сам. Дедлайн обязателен — промис оседает
     * в кэше на всю сессию.
     */
    getStickerAnimation(mediaId: string): Promise<EmojiAnimation> {
      return transport.request(Endpoints.STICKER_BYTES({ mediaId }), { signal: emojiDeadline() })
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
