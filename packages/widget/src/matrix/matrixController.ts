import type { CardAction } from '../domain/adaptiveCards'
import type {
  EmojiAnimation,
  EmojiCatalog,
  EmojiCategory,
  EmojiIndex,
  StickerPack,
} from '../domain/emoji'
import { MediaUnavailableError } from '../domain/mediaError'
import {
  createOptimisticMediaMessage,
  createOptimisticTextMessage,
  isOptimistic,
} from '../domain/optimistic'
import { findOwnReaction, type ReactionEntry } from '../domain/reactions'
import { canMoveMarker } from '../domain/receipts'
import { isAdaptiveCard, isMedia, isSystem, type MediaTimelineItem } from '../domain/timeline'
import { isAbortError } from '../shared/utils/abort'
// Оба кэша медиа считают записи, а не байты: вес записи в каждом ограничен сверху
// (миниатюра — по построению, свой файл — лимитом композера), поэтому число записей и есть
// предсказуемый потолок памяти.
import { evictOldest } from '../shared/utils/evictOldest'
import type { ImageDimensions } from '../shared/utils/imageDimensions'
import { parseMxcUrl, type ParsedMxcUrl } from '../shared/utils/mxc'
import { sleep } from '../shared/utils/sleep'
import type { ChatRuntimeState, RuntimeAction } from '../store/state'
import { type MatrixApi, type ThumbnailSize } from './api/matrixApi'
import {
  isForbiddenError,
  isMatrixAuthError,
  isMediaPendingError,
  isNotFoundError,
  isUserDeactivatedError,
  type AuthErrorContext,
} from './api/matrixError'
import { MatrixHistoryLoader } from './history/historyLoader'
import { toEmojiCatalog, toEmojiCategory, toEmojiIndex, toStickerPacks } from './mappers/emoji'
import { classifyMediaError } from './mappers/mediaError'
import {
  toAdaptiveActionContent,
  toMessageContent,
  type OutgoingTimelineItem,
} from './mappers/outgoing'
import { toRoomSyncPatch } from './mappers/roomSync'
import { classifyUploadError } from './mappers/uploadError'
import type { GuestSession, MatrixSessionManager } from './session/sessionManager'
import { MatrixSyncLoop, type SyncTick } from './sync/syncLoop'

export const CONNECTION_FAILED_ERROR = 'Не удалось подключиться'

export interface SendFileOptions {
  caption?: string | undefined
  replyToEventId?: string | undefined
  dims?: ImageDimensions | undefined
}

// Право на скачивание появляется, когда writer запишет привязку файла к комнате, а событие
// в /sync может обогнать её на доли секунды — отсюда единственный отложенный повтор на 403.
const FORBIDDEN_RETRY_DELAY_MS = 400

// Сколько миниатюр держим. Вытеснение безопасно в любой момент: object-URL сам держит свой
// blob живым, пока компонент его не освободит.
const MAX_CACHED_PREVIEWS = 40

// Сколько своих файлов держим целиком (до 10 МБ каждый — размер режется ещё в композере).
// Копия живёт до первого ответа сервера по этому mxc, а у чипа файла сервер спрашивают только
// по клику «скачать»: без потолка всё отправленное за сеанс осталось бы в памяти до конца
// сессии. Одновременно «в полёте» бывает один-два файла, поэтому запас минимальный.
const MAX_LOCAL_ORIGINALS = 3

export interface MatrixService {
  connect: () => Promise<void>
  disconnect: () => void
  sendMessage: (text: string, replyToEventId?: string) => Promise<void>
  sendFile: (file: File, options?: SendFileOptions) => Promise<void>
  sendCardAction: (cardEventId: string, action: CardAction) => Promise<void>
  loadPreview: (mxcUrl: string, size: ThumbnailSize) => Promise<Blob>
  downloadFile: (mxcUrl: string) => Promise<Blob>
  loadEmojiCatalog: () => Promise<EmojiCatalog>
  loadEmojiCategory: (categoryId: string) => Promise<EmojiCategory>
  loadEmojiIndex: () => Promise<EmojiIndex>
  loadEmojiAnimation: (codepoint: string, version: string) => Promise<EmojiAnimation>
  loadStickerPacks: () => Promise<StickerPack[]>
  cancelUpload: (localId: string) => void
  resendMessage: (localId: string) => Promise<void>
  markRead: (eventId: string) => Promise<void>
  toggleReaction: (targetEventId: string, key: string) => Promise<void>
  loadMoreHistory: () => Promise<void>
  stopLoadingHistory: () => void
}

export interface MatrixControllerDeps {
  api: MatrixApi
  sessionManager: MatrixSessionManager
  dispatch: (action: RuntimeAction) => void
  getState: () => ChatRuntimeState
}

export class MatrixController implements MatrixService {
  private readonly api: MatrixApi
  private readonly syncLoop: MatrixSyncLoop
  private readonly historyLoader: MatrixHistoryLoader
  private readonly sessionManager: MatrixSessionManager

  private readonly dispatch: (action: RuntimeAction) => void
  private readonly getState: () => ChatRuntimeState

  private lifecycleId = 0
  private sessionRecovery: Promise<void> | null = null

  private readonly uploads = new Map<string, AbortController>()

  // Кэш байтов превью, а не object-URL: URL создаёт и освобождает тот компонент, который
  // рисует картинку — только он знает, когда revoke безопасен. Хранится промис, а не блоб:
  // он же и дедуп — два ряда с одной картинкой (и двойной эффект StrictMode) делят один запрос.
  private readonly previews = new Map<string, Promise<Blob>>()
  // Оригиналы своих отправленных файлов, по mxc. Не кэш ради скорости, а подмена недоступного:
  // до вердикта CDR сервер отвечает на них 504, и без локальной копии своя же картинка
  // пропадала бы из ленты сразу после отправки. Отвечает и на превью, и на оригинал.
  private readonly localOriginals = new Map<string, Blob>()

  // Индекс пака. В отличие от медиа это server-managed справочник — один и тот же ответ для
  // всех, поэтому смена сессии его не обесценивает и nextLifecycle() его не чистит. Хранится
  // промис: он же дедуп параллельных запросов, пока первый ещё в полёте.
  private emojiIndex: Promise<EmojiIndex> | null = null

  // txnId незавершённых ответов на карточки, по `${cardEventId}#${actionId}`. Нужен, чтобы
  // повтор после сетевого сбоя ушёл с тем же ключом идемпотентности; чистится при смене
  // сессии — в новой комнате прежние event_id уже ничего не адресуют.
  private readonly cardActionTxnIds = new Map<string, string>()

  constructor(deps: MatrixControllerDeps) {
    this.api = deps.api
    this.syncLoop = new MatrixSyncLoop(deps.api)
    this.historyLoader = new MatrixHistoryLoader({
      api: deps.api,
      dispatch: deps.dispatch,
      onAuthError: (err) => this.handleAuthError(err, 'loadHistory'),
    })
    this.sessionManager = deps.sessionManager
    this.dispatch = deps.dispatch
    this.getState = deps.getState
  }

  async connect(): Promise<void> {
    const { phase } = this.getState()
    if (!(phase === 'idle' || phase === 'error')) return

    const lifecycleId = this.nextLifecycle()

    await this.runConnectFlow(
      lifecycleId,
      'connecting',
      () => this.sessionManager.establishSession(),
      (err) => {
        console.error('[PLChat] connect failed:', err)

        if (isUserDeactivatedError(err)) {
          this.sessionManager.clearSession()
        }
      },
    )
  }

  disconnect(): void {
    this.stopSessionActivity()
    this.nextLifecycle()
    this.dispatch({ type: 'session.closed' })
  }

  async sendMessage(text: string, replyToEventId?: string): Promise<void> {
    const connection = this.requireConnection()
    if (!connection) return

    const message = createOptimisticTextMessage({
      sender: connection.identity.userId,
      text: text.trim(),
      replyToEventId,
    })
    this.dispatch({ type: 'message.optimisticAdded', message })
    this.dispatch({ type: 'reply.cleared' })

    await this.dispatchSend(connection.identity.roomId, message, 'sendMessage')
  }

  async sendFile(file: File, options: SendFileOptions = {}): Promise<void> {
    const connection = this.requireConnection()
    if (!connection) return

    const { caption, replyToEventId, dims } = options

    const message = createOptimisticMediaMessage({
      sender: connection.identity.userId,
      file,
      caption,
      dims,
      replyToEventId,
    })
    this.dispatch({ type: 'message.optimisticAdded', message })
    this.dispatch({ type: 'reply.cleared' })

    const uploaded = await this.uploadFile(message, file, 'sendFile')
    if (!uploaded) return

    await this.dispatchSend(connection.identity.roomId, uploaded, 'sendFile')
  }

  async sendCardAction(cardEventId: string, action: CardAction): Promise<void> {
    const connection = this.requireConnection()
    if (!connection) return

    const existing = connection.room.cardAnswers[cardEventId]
    if (existing?.status === 'sending' || existing?.status === 'sent') return

    this.dispatch({ type: 'card.answering', cardEventId, actionId: action.id })
    const lifecycleId = this.lifecycleId

    // txnId переживает неудачную попытку: это ключ идемпотентности PUT /send. Если ответ
    // потерялся уже после записи события (обрыв, 502 от прокси), повтор с тем же ключом
    // вернёт тот же event_id, а не создаст второе kc.adaptive.action — иначе бот ветвился бы
    // по одной карточке дважды.
    const txnKey = `${cardEventId}#${action.id}`
    const txnId = this.cardActionTxnIds.get(txnKey) ?? crypto.randomUUID()
    this.cardActionTxnIds.set(txnKey, txnId)

    try {
      await this.api.sendMessage({
        roomId: connection.identity.roomId,
        txnId,
        content: toAdaptiveActionContent(cardEventId, action),
      })
      if (!this.isCurrentLifecycle(lifecycleId)) return

      this.cardActionTxnIds.delete(txnKey)
      this.dispatch({ type: 'card.answered', cardEventId })
    } catch (err) {
      if (!this.isCurrentLifecycle(lifecycleId)) return

      this.dispatch({ type: 'card.answerFailed', cardEventId })
      this.handleAuthError(err, 'sendCardAction')
    }
  }

  private async uploadFile(
    draft: MediaTimelineItem,
    file: File,
    context: AuthErrorContext,
  ): Promise<MediaTimelineItem | null> {
    const { localId, content } = draft

    const lifecycleId = this.lifecycleId

    this.uploads.get(localId)?.abort()
    const controller = new AbortController()
    this.uploads.set(localId, controller)

    let contentUri: string
    try {
      const upload = await this.api.uploadMedia(file, {
        signal: controller.signal,
        contentType: content.info.mimetype,
        onProgress: (pct) => this.dispatch({ type: 'message.uploadProgress', localId, pct }),
      })
      contentUri = upload.content_uri
    } catch (err) {
      if (isAbortError(err) || !this.isCurrentLifecycle(lifecycleId)) return null

      this.dispatch({ type: 'message.failed', localId, upload: classifyUploadError(err) })
      this.handleAuthError(err, context)
      return null
    } finally {
      if (this.uploads.get(localId) === controller) this.uploads.delete(localId)
    }
    if (controller.signal.aborted || !this.isCurrentLifecycle(lifecycleId)) return null

    // Перекладываем локальный файл в память контроллера,
    // пока идет проверка со стороны сервера, для отображения превью
    this.localOriginals.set(contentUri, file)
    evictOldest(this.localOriginals, MAX_LOCAL_ORIGINALS)

    this.dispatch({ type: 'message.uploaded', localId, url: contentUri })

    return { ...draft, content: { ...content, url: contentUri } }
  }

  loadPreview(mxcUrl: string, size: ThumbnailSize): Promise<Blob> {
    return this.withLocalFallback(mxcUrl, (parsed) => this.previewBytes(parsed, size))
  }

  downloadFile(mxcUrl: string): Promise<Blob> {
    return this.withLocalFallback(mxcUrl, (parsed) =>
      this.fetchMediaBytes(() => this.api.downloadMedia(parsed)),
    )
  }

  // Каталоги эмодзи и стикеров не проходят через стор и не сверяются с lifecycleId: это не
  // состояние диалога, а справочник — он одинаков для любой сессии и переживает переподключение.
  async loadEmojiCatalog(): Promise<EmojiCatalog> {
    return toEmojiCatalog(await this.api.getEmojiCategories())
  }

  async loadEmojiCategory(categoryId: string): Promise<EmojiCategory> {
    return toEmojiCategory(await this.api.getEmojiCategory(categoryId))
  }

  /**
   * Индекс пака для ленты. В отличие от каталога вкладок, запрашивается один раз за жизнь
   * вкладки: он нужен на каждое текстовое сообщение, а меняется только с версией пака.
   */
  loadEmojiIndex(): Promise<EmojiIndex> {
    this.emojiIndex ??= this.api
      .getEmojiPacks()
      .then(toEmojiIndex)
      .catch((err: unknown) => {
        // Упавший запрос в кэше не держим: следующая попытка начнёт заново.
        this.emojiIndex = null
        throw err
      })

    return this.emojiIndex
  }

  loadEmojiAnimation(codepoint: string, version: string): Promise<EmojiAnimation> {
    return this.api.getEmojiAnimation(codepoint, version)
  }

  async loadStickerPacks(): Promise<StickerPack[]> {
    return toStickerPacks(await this.api.getStickerPacks())
  }

  private async withLocalFallback(
    mxcUrl: string,
    fetch: (parsed: ParsedMxcUrl) => Promise<Blob>,
  ): Promise<Blob> {
    const parsed = parseMxcUrl(mxcUrl)
    // Битую ссылку не вылечит ни повтор, ни ожидание вердикта — для UI это тот же «файла нет».
    if (!parsed) throw new MediaUnavailableError('rejected')

    try {
      const blob = await fetch(parsed)
      // Сервер отдал файл сам — локальная копия больше не нужна
      this.localOriginals.delete(mxcUrl)

      return blob
    } catch (err) {
      // 504 — файл ещё в карантине CDR; 403 переживший отложенный повтор — привязка файла
      // к комнате всё ещё не записана. Ни то, ни другое не вердикт «нет», а свои байты у нас
      // есть: показываем их, не выдумывая пользователю ошибку по только что отправленному файлу.
      const local = this.localOriginals.get(mxcUrl)
      if (local && (isMediaPendingError(err) || isForbiddenError(err))) return local

      throw new MediaUnavailableError(classifyMediaError(err), { cause: err })
    }
  }

  private async previewBytes(parsed: ParsedMxcUrl, size: ThumbnailSize): Promise<Blob> {
    try {
      return await this.cachedPreview(parsed, size)
    } catch (err) {
      // 404 у превью означает «превью не генерировалось» (нестандартный формат, сбой) — идём за
      // оригиналом. 504 (карантин) и 403 сюда не попадают: их повторным запросом не вылечить.
      if (!isNotFoundError(err)) throw err

      // Оригинал в кэш превью не кладём: он на порядки тяжелее миниатюры и обесценил бы лимит,
      // посчитанный в записях. Цена честнее, чем кажется: такая картинка качается целиком на
      // каждый ремаунт ряда, и параллельные ряды с одним файлом не делят запрос (дедуп даёт
      // только кэш). Размен принят ради простоты кэша — случай редкий, форматов без превью мало.
      return this.fetchMediaBytes(() => this.api.downloadMedia(parsed))
    }
  }

  private cachedPreview(parsed: ParsedMxcUrl, size: ThumbnailSize): Promise<Blob> {
    const key = `${parsed.serverName}/${parsed.mediaId}#${size.width}x${size.height}`
    const cached = this.previews.get(key)
    if (cached) return cached

    const request = this.fetchMediaBytes(() => this.api.getThumbnail(parsed, size)).catch(
      (err: unknown) => {
        // Упавший запрос в кэше не держим: следующий mount (или кнопка «повторить») пробует заново.
        this.previews.delete(key)
        throw err
      },
    )

    this.previews.set(key, request)
    evictOldest(this.previews, MAX_CACHED_PREVIEWS)

    return request
  }

  private async fetchMediaBytes(call: () => Promise<Blob>): Promise<Blob> {
    try {
      return await call()
    } catch (err) {
      if (!isForbiddenError(err)) throw err

      await sleep(FORBIDDEN_RETRY_DELAY_MS)
      return call()
    }
  }

  cancelUpload(localId: string): void {
    this.uploads.get(localId)?.abort()
    this.uploads.delete(localId)
    this.dispatch({ type: 'message.discarded', localId })
  }

  private stopSessionActivity(): void {
    this.stopLoadingHistory()

    for (const [localId, controller] of this.uploads) {
      controller.abort()
      // Заливку оборвали мы сами, сервер ничего не решал: причина заведомо повторяемая.
      this.dispatch({ type: 'message.failed', localId, upload: 'network' })
    }
    this.uploads.clear()

    this.syncLoop.stop()
  }

  async resendMessage(localId: string): Promise<void> {
    const connection = this.requireConnection()
    if (!connection) return

    const { identity, room } = connection
    const message = room.timeline.find((m) => m.localId === localId)

    if (
      !message ||
      isSystem(message) ||
      isAdaptiveCard(message) ||
      message.sendStatus !== 'failed' ||
      !message.txnId
    ) {
      return
    }

    this.dispatch({ type: 'message.retrying', localId })

    const sendable =
      isMedia(message) && message.upload
        ? await this.uploadFile(message, message.upload.file, 'resendMessage')
        : message

    if (!sendable) return

    await this.dispatchSend(identity.roomId, sendable, 'resendMessage')
  }

  async markRead(eventId: string): Promise<void> {
    const connection = this.requireConnection()
    if (!connection) return

    const { identity, room } = connection

    const currentMarker = room.readReceipts[identity.userId]?.eventId ?? null
    if (!canMoveMarker(room.timeline, currentMarker, eventId)) return

    // Двигаем маркер ДО запроса, потому что гард выше смотрит именно в стор.
    // Иначе, пока летит POST, стор хранит старый маркер, и каждый скан (скролл, новое сообщение)
    // снова проходил бы гард и слал тот же POST.
    this.dispatch({ type: 'receipt.markedRead', userId: identity.userId, eventId })
    const lifecycleId = this.lifecycleId

    try {
      await this.api.sendReadReceipt(identity.roomId, eventId)
    } catch (err) {
      if (!this.isCurrentLifecycle(lifecycleId)) return

      if (this.handleAuthError(err, 'markRead')) {
        this.dispatch({
          type: 'receipt.sendFailed',
          userId: identity.userId,
          eventId,
          rollbackTo: currentMarker,
        })
        return
      }
    }
  }

  /**
   * Ставит или снимает свою реакцию — одно действие на оба направления: что делать, знает стор,
   * а не вызывающий компонент.
   *
   * Стор правим ДО запроса (и откатываем на ошибке) по той же причине, что и у read-маркера:
   * ветку «поставить/снять» выбирает гард по стору, и без немедленного обновления второй тап
   * ушёл бы вторым PUT'ом на постановку.
   */
  async toggleReaction(targetEventId: string, key: string): Promise<void> {
    const connection = this.requireConnection()
    if (!connection) return

    const { identity, room } = connection
    // У черновика нет серверного id — реакции не на что вешать.
    if (isOptimistic(targetEventId)) return

    const own = findOwnReaction(room.reactions, targetEventId, identity.userId, key)

    if (!own) {
      await this.addReaction(identity.roomId, targetEventId, identity.userId, key)
      return
    }
    // Постановка ещё в полёте: редактировать нечего, снимет следующий тап.
    if (isOptimistic(own.eventId)) return

    await this.removeReaction(identity.roomId, targetEventId, own)
  }

  private async addReaction(
    roomId: string,
    targetEventId: string,
    sender: string,
    key: string,
  ): Promise<void> {
    const localEventId = `optimistic:${crypto.randomUUID()}`
    const txnId = crypto.randomUUID()
    const entry: ReactionEntry = { eventId: localEventId, sender, key }

    this.dispatch({ type: 'reaction.added', targetEventId, entry })
    const lifecycleId = this.lifecycleId

    try {
      const { event_id } = await this.api.sendReaction({ roomId, txnId, targetEventId, key })
      if (!this.isCurrentLifecycle(lifecycleId)) return

      this.dispatch({ type: 'reaction.confirmed', targetEventId, localEventId, eventId: event_id })
    } catch (err) {
      if (!this.isCurrentLifecycle(lifecycleId)) return

      this.dispatch({ type: 'reaction.removed', targetEventId, eventId: localEventId })
      this.handleAuthError(err, 'toggleReaction')
    }
  }

  private async removeReaction(
    roomId: string,
    targetEventId: string,
    entry: ReactionEntry,
  ): Promise<void> {
    this.dispatch({ type: 'reaction.removed', targetEventId, eventId: entry.eventId })
    const lifecycleId = this.lifecycleId

    try {
      await this.api.redactEvent({ roomId, txnId: crypto.randomUUID(), eventId: entry.eventId })
    } catch (err) {
      if (!this.isCurrentLifecycle(lifecycleId)) return

      this.dispatch({ type: 'reaction.added', targetEventId, entry })
      this.handleAuthError(err, 'toggleReaction')
    }
  }

  // Механика догрузки живёт в MatrixHistoryLoader; контроллер даёт ей только сессионный
  // контекст — откуда тянуть (getContext) и когда цикл устарел (isStale по поколению сессии).
  async loadMoreHistory(): Promise<void> {
    const lifecycleId = this.lifecycleId

    await this.historyLoader.load({
      getContext: () => {
        const connection = this.requireConnection()

        if (!connection || connection.room.prevBatch === null) return

        return {
          roomId: connection.identity.roomId,
          prevBatch: connection.room.prevBatch,
        }
      },
      isStale: () => !this.isCurrentLifecycle(lifecycleId),
    })
  }

  stopLoadingHistory(): void {
    this.historyLoader.stop()
  }

  private async dispatchSend(
    roomId: string,
    message: OutgoingTimelineItem,
    context: AuthErrorContext,
  ): Promise<void> {
    const localId = message.localId
    const lifecycleId = this.lifecycleId

    try {
      const { event_id } = await this.api.sendMessage({
        roomId,
        txnId: message.txnId!,
        content: toMessageContent(message),
      })
      if (!this.isCurrentLifecycle(lifecycleId)) return

      this.dispatch({ type: 'message.sent', localId, eventId: event_id })
    } catch (err) {
      if (!this.isCurrentLifecycle(lifecycleId)) return

      this.dispatch({ type: 'message.failed', localId })

      // sync-петля не обязательно первой заметит мёртвую сессию — отправка может
      // словить ту же auth-ошибку раньше следующего long-poll.
      this.handleAuthError(err, context)
    }
  }

  private async runConnectFlow(
    lifecycleId: number,
    phase: 'connecting' | 'recovering',
    establish: () => Promise<GuestSession>,
    onFailure: (err: unknown) => void,
  ): Promise<void> {
    this.dispatch({ type: phase === 'recovering' ? 'session.recovering' : 'connection.connecting' })

    try {
      const session = await establish()
      if (!this.isCurrentLifecycle(lifecycleId)) return

      this.dispatch({
        type: 'session.started',
        identity: { userId: session.userId, roomId: session.roomId },
        cursor: session.cursor,
        room: toRoomSyncPatch(session.initialRoom),
      })
      this.syncLoop.start({
        cursor: session.cursor,
        onTick: this.handleSyncTick,
        onError: this.handleSyncError,
      })
    } catch (err) {
      if (!this.isCurrentLifecycle(lifecycleId)) return

      onFailure(err)
      this.dispatch({ type: 'connection.failed', error: CONNECTION_FAILED_ERROR })
    }
  }

  private handleSyncTick = (tick: SyncTick): void => {
    const roomId = this.getState().identity?.roomId ?? null
    const joinedRoom = roomId ? (tick.response.rooms?.join?.[roomId] ?? null) : null

    this.dispatch({
      type: 'sync.received',
      cursor: tick.next,
      ...(joinedRoom ? { room: toRoomSyncPatch(joinedRoom) } : {}),
    })
  }

  private handleSyncError = (err: unknown, meta: { backoff: number }): void => {
    if (this.handleAuthError(err, 'sync')) return

    console.error('[PLChat] sync error, retrying in', meta.backoff, 'ms:', err)
  }

  private handleAuthError(err: unknown, context: AuthErrorContext): boolean {
    if (isUserDeactivatedError(err)) {
      console.error(`[PLChat] ${context} user deactivated:`, err)
      this.failSession()
      return true
    }

    if (isMatrixAuthError(err)) {
      this.recoverFromAuthError(err, context)
      return true
    }

    return false
  }

  private recoverFromAuthError(err: unknown, context: AuthErrorContext): void {
    console.error(`[PLChat] ${context} auth error:`, err)
    this.stopSessionActivity()
    this.startSessionRecovery(this.lifecycleId)
  }

  private startSessionRecovery(lifecycleId: number): void {
    if (this.sessionRecovery) return

    const recovery = this.runConnectFlow(
      lifecycleId,
      'recovering',
      () => this.sessionManager.resetGuestSession(),
      (err) => console.error('[PLChat] session recovery failed:', err),
    )
    this.sessionRecovery = recovery
    recovery.finally(() => {
      if (this.sessionRecovery === recovery) {
        this.sessionRecovery = null
      }
    })
  }

  private failSession(): void {
    this.stopSessionActivity()
    this.nextLifecycle()
    this.sessionManager.clearSession()
    this.dispatch({ type: 'connection.failed', error: CONNECTION_FAILED_ERROR })
  }

  private nextLifecycle(): number {
    this.lifecycleId += 1
    this.sessionRecovery = null
    // Смена сессии — смена прав на медиа: чужие байты в кэше держать нельзя.
    this.previews.clear()
    this.localOriginals.clear()
    // Ключи идемпотентности привязаны к событиям прежней комнаты и в новой сессии бессмысленны.
    this.cardActionTxnIds.clear()
    return this.lifecycleId
  }

  private isCurrentLifecycle(lifecycleId: number): boolean {
    return this.lifecycleId === lifecycleId
  }

  private requireConnection(): {
    identity: NonNullable<ChatRuntimeState['identity']>
    room: ChatRuntimeState['room']
  } | null {
    const { identity, phase, room } = this.getState()

    if (phase !== 'connected' || !identity) {
      return null
    }
    return { identity, room }
  }
}
