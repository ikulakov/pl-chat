import type { LottieAnimation } from '@/domain/emoji'
import type { EventId, MediaId, RoomId, TxnId } from '@/shared/types/ids'
import type { ThumbnailSize } from '@/domain/media'
import type { ParsedMxcUrl } from '@/shared/utils/mxc'
import type { SetPresence } from '../sync/presence'
import type * as Matrix from '../wire'
import { RelType } from '../wire/consts'
import { Endpoints } from './endpoints'
import type { MatrixTransport, UploadOptions } from './matrixTransport'

// Размер страницы истории (limit для GET /messages). Лимит на сервере считает все
// события (m.room.member, m.reaction и т.п.), максимум сервера — 100.
const HISTORY_PAGE_SIZE = 50

// Окно long-poll: сервер держит /sync до этого времени, потом отвечает пустым батчем.
const SYNC_TIMEOUT_MS = 25_000

// Запас поверх серверного окна, после которого запрос считается зависшим. Дефолтный дедлайн
// транспорта тут не годится: long-poll висит законно всё окно, и общий срок его бы срезал.
//
// Запас щедрый намеренно: дедлайн должен рвать только мёртвый коннект, а не следить за
// скоростью. Впритык он убивал бы живой ответ, который просто медленно едет по вялому
// мобильному линку, — и такой обрыв ещё и засчитается счётчиком «ответа не было», то есть
// баннер «нет связи» замигает на работающей сети. У matrix-js-sdk на окно 30 с запас 80 с.
const SYNC_DEADLINE_SLACK_MS = 30_000

// Дедлайн запросов эмодзи. Обязателен, потому что их промисы мемоизируются в кэшах, живущих
// всю сессию (lottieCache, emojiBitmap, защёлка emojiIndex): зависший запрос без отказа
// оставил бы там мёртвый промис навсегда, и повтор возвращал бы его же — ровно то, ради чего
// таймаут стоит в transport.download().
const EMOJI_TIMEOUT_MS = 30_000
const emojiDeadline = () => AbortSignal.timeout(EMOJI_TIMEOUT_MS)

interface SendMessageParams {
  roomId: RoomId
  txnId: TxnId
  /** `m.room.message` для текста и медиа, `m.sticker` для стикера. */
  eventType: string
  content: Matrix.OutgoingContent
}

interface SendReactionParams {
  roomId: RoomId
  txnId: TxnId
  targetEventId: EventId
  key: string
}

interface RedactEventParams {
  roomId: RoomId
  txnId: TxnId
  eventId: EventId
}

export function createMatrixApi(transport: MatrixTransport) {
  return {
    registerGuest(): Promise<Matrix.RegisterResponse> {
      return transport.request(Endpoints.REGISTER, {
        method: 'POST',
        body: {},
        searchParams: { kind: 'guest' },
      })
    },

    initialSync(): Promise<Matrix.SyncResponse> {
      return transport.request(Endpoints.SYNC, {
        searchParams: { timeout: 0 },
      })
    },

    longPollSync(
      since: string,
      options?: {
        signal?: AbortSignal | undefined
        timeoutMs?: number
        /** Присутствие клиента на момент запроса; без него сервер активность не бампит. */
        setPresence?: SetPresence
      },
    ): Promise<Matrix.SyncResponse> {
      const timeout = options?.timeoutMs ?? SYNC_TIMEOUT_MS

      return transport.request(Endpoints.SYNC, {
        searchParams: {
          timeout,
          since,
          ...(options?.setPresence ? { set_presence: options.setPresence } : {}),
        },
        // Дедлайн на попытку поверх сигнала петли: тот означает «петлю остановили», а этот —
        // «ответа мы уже не дождёмся», и дальше он идёт обычной ошибкой sync'а.
        deadlineMs: timeout + SYNC_DEADLINE_SLACK_MS,
        signal: options?.signal,
      })
    },

    getRoomHistory(
      roomId: RoomId,
      from: string,
      options?: { signal?: AbortSignal | undefined },
    ): Promise<Matrix.MessagesResponse> {
      return transport.request(Endpoints.LOAD_HISTORY({ roomId }), {
        searchParams: {
          dir: 'b',
          from,
          limit: HISTORY_PAGE_SIZE,
        },
        signal: options?.signal,
      })
    },

    sendMessage({
      roomId,
      txnId,
      eventType,
      content,
    }: SendMessageParams): Promise<Matrix.SendEventResponse> {
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
    }: SendReactionParams): Promise<Matrix.SendEventResponse> {
      const content: Matrix.OutgoingReactionContent = {
        'm.relates_to': { rel_type: RelType.Annotation, event_id: targetEventId, key },
      }

      return transport.request(Endpoints.SEND_REACTION({ roomId, txnId }), {
        method: 'PUT',
        body: content,
      })
    },

    // Снятие реакции — редакция самого события реакции; сообщения клиент не редактирует.
    redactEvent({ roomId, txnId, eventId }: RedactEventParams): Promise<Matrix.SendEventResponse> {
      const content: Matrix.OutgoingRedactionContent = { redacts: eventId }

      return transport.request(Endpoints.SEND_REDACTION({ roomId, txnId }), {
        method: 'PUT',
        body: content,
      })
    },

    uploadMedia(file: File, options?: UploadOptions): Promise<Matrix.UploadResponse> {
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

    getEmojiCategories(): Promise<Matrix.EmojiCategoriesResponse> {
      return transport.request(Endpoints.EMOJI_CATEGORIES, { signal: emojiDeadline() })
    },

    getEmojiCategory(categoryId: string): Promise<Matrix.EmojiCategoryWire> {
      return transport.request(Endpoints.EMOJI_CATEGORY({ categoryId }), {
        signal: emojiDeadline(),
      })
    },

    /** Весь пак разом: по нему лента строит индекс «символ → codepoint». */
    getEmojiPacks(): Promise<Matrix.EmojiPacksResponse> {
      return transport.request(Endpoints.EMOJI_PACKS, { signal: emojiDeadline() })
    },

    /**
     * Байты анимации. `.tgs` — это gzip, и он отдаётся с `Content-Encoding: gzip`: браузер
     * разжимает сам, на выходе готовый JSON. Распаковывать ничего не нужно.
     * `v` — cache-buster: без него после переseed'а пака клиент неделю получал бы из
     * immutable-кэша старую анимацию.
     */
    getEmojiAnimation(codepoint: string, version: string): Promise<LottieAnimation> {
      return transport.request(Endpoints.EMOJI_LOTTIE({ codepoint }), {
        searchParams: { v: version },
        signal: emojiDeadline(),
      })
    },

    /**
     * Пачка анимаций одним ответом. `cp` уезжает строкой через запятую — Spring разбирает её
     * в список; `v` — тот же cache-buster, что и у одиночного маршрута.
     *
     * Сервер склеивает ответ из готовых gzip-членов, поэтому распаковывать по-прежнему нечего:
     * браузер разжимает поток целиком и отдаёт цельный JSON.
     */
    getEmojiAnimations(codepoints: string[], version: string): Promise<Matrix.EmojiBundleResponse> {
      return transport.request(Endpoints.EMOJI_BUNDLE, {
        searchParams: { cp: codepoints.join(','), v: version },
        signal: emojiDeadline(),
      })
    },

    getStickerPacks(): Promise<Matrix.StickerPacksResponse> {
      return transport.request(Endpoints.STICKER_PACKS, { signal: emojiDeadline() })
    },

    /**
     * Байты Lottie-стикера. Тот же публичный маршрут, что и у растровых: `.tgs` отдаётся с
     * `Content-Encoding: gzip`, браузер разжимает сам. Дедлайн обязателен — промис оседает
     * в кэше на всю сессию.
     */
    getStickerAnimation(mediaId: MediaId): Promise<LottieAnimation> {
      return transport.request(Endpoints.STICKER_BYTES({ mediaId }), { signal: emojiDeadline() })
    },

    sendReadReceipt(roomId: RoomId, eventId: EventId): Promise<Record<string, never>> {
      return transport.request(Endpoints.MARK_READ({ roomId, eventId }), {
        method: 'POST',
        body: {},
      })
    },
  }
}

export type MatrixApi = ReturnType<typeof createMatrixApi>
