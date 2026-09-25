import type { CardAction } from '@/domain/adaptiveCards'
import type { StickerItem } from '@/domain/emoji'
import {
  createOptimisticMediaMessage,
  createOptimisticStickerMessage,
  createOptimisticTextMessage,
} from '@/domain/optimistic'
import { canMoveMarker } from '@/domain/receipts'
import { isAdaptiveCard, isMedia, isSystem, type MediaTimelineItem } from '@/domain/timeline'
import type { EventId, LocalId, RoomId, TxnId } from '@/shared/types/ids'
import { isDeadlineError } from '@/shared/utils/abort'
import { consoleDev } from '@/shared/utils/consoleDev'
import { Generation } from '@/shared/utils/generation'
import type { ImageDimensions } from '@/shared/utils/imageDimensions'
import type { ChatRuntimeState, RuntimeAction } from '@/store/state'
import { type MatrixApi } from './api/matrixApi'
import { isMatrixAuthError, isUserDeactivatedError, type AuthErrorContext } from './api/matrixError'
import { MatrixHistoryLoader } from './history/historyLoader'
import {
  outgoingEventType,
  toAdaptiveActionContent,
  toMessageContent,
  type OutgoingTimelineItem,
} from './mappers/outgoing'
import { toRoomSyncPatch } from './mappers/roomSync'
import { classifyUploadError } from './mappers/uploadError'
import type { MatrixMedia } from './media/matrixMedia'
import { MatrixReactions } from './reactions/matrixReactions'
import type { GuestSession, MatrixSessionManager } from './session/sessionManager'
import { MatrixSyncLoop, type SyncTick } from './sync/syncLoop'
import { MatrixEventType } from './wire/consts'

export interface SendFileOptions {
  caption?: string | undefined
  replyToEventId?: EventId | undefined
  dims?: ImageDimensions | undefined
}

// Сколько подряд упавших sync'ов считаем потерей связи. Одиночный сбой ретраится через
// секунду и обычно проходит — баннер из-за него мигал бы на ровном месте.
const OFFLINE_AFTER_FAILURES = 2

export interface MatrixService {
  connect: () => Promise<void>
  disconnect: () => void
  sendMessage: (text: string, replyToEventId?: EventId) => Promise<void>
  sendFile: (file: File, options?: SendFileOptions) => Promise<void>
  sendSticker: (sticker: StickerItem) => Promise<void>
  sendCardAction: (cardEventId: EventId, action: CardAction) => Promise<void>
  cancelUpload: (localId: LocalId) => void
  resendMessage: (localId: LocalId) => Promise<void>
  markRead: (eventId: EventId) => Promise<void>
  toggleReaction: (targetEventId: EventId, key: string) => Promise<void>
  loadMoreHistory: () => Promise<void>
  stopLoadingHistory: () => void
}

export interface MatrixControllerDeps {
  api: MatrixApi
  media: MatrixMedia
  sessionManager: MatrixSessionManager
  dispatch: (action: RuntimeAction) => void
  getState: () => ChatRuntimeState
}

export class MatrixController implements MatrixService {
  private readonly api: MatrixApi
  private readonly syncLoop: MatrixSyncLoop
  private readonly media: MatrixMedia
  private readonly historyLoader: MatrixHistoryLoader
  private readonly reactions: MatrixReactions
  private readonly sessionManager: MatrixSessionManager

  private readonly dispatch: (action: RuntimeAction) => void
  private readonly getState: () => ChatRuntimeState

  // Поколение сессии: гаснет при смене сессии, и ответы прежней уже ничего не трогают.
  private readonly generation = new Generation()

  // Подряд оставшиеся без ответа sync'и: порог, после которого объявляем потерю связи.
  // Счётчик внутренний — в сторе ему делать нечего, UI знает только итог (`online`).
  private syncFailures = 0
  private unwatchNetwork: (() => void) | null = null

  // txnId незавершённых ответов на карточки, по `${cardEventId}#${actionId}`. Нужен, чтобы
  // повтор после сетевого сбоя ушёл с тем же ключом идемпотентности; чистится при смене
  // сессии — в новой комнате прежние event_id уже ничего не адресуют.
  private readonly cardActionTxnIds = new Map<string, TxnId>()

  constructor(deps: MatrixControllerDeps) {
    this.api = deps.api
    this.syncLoop = new MatrixSyncLoop(deps.api)
    this.media = deps.media
    this.historyLoader = new MatrixHistoryLoader({
      api: deps.api,
      dispatch: deps.dispatch,
      onAuthError: (err) => this.handleAuthError(err, 'loadHistory'),
    })
    this.reactions = new MatrixReactions({
      api: deps.api,
      dispatch: deps.dispatch,
      getConnection: () => this.requireConnection(),
      onAuthError: (err) => this.handleAuthError(err, 'toggleReaction'),
    })
    this.sessionManager = deps.sessionManager
    this.dispatch = deps.dispatch
    this.getState = deps.getState
  }

  async connect(): Promise<void> {
    const { phase } = this.getState()
    if (!(phase === 'idle' || phase === 'error')) return

    this.nextGeneration()

    await this.runConnectFlow(
      'connecting',
      () => this.sessionManager.establishSession(),
      (err) => {
        consoleDev.error('connect failed', err)

        if (isUserDeactivatedError(err)) {
          this.sessionManager.clearSession()
        }
      },
    )
  }

  disconnect(): void {
    this.stopSessionActivity()
    this.nextGeneration()
    this.dispatch({ type: 'session.closed' })
  }

  async sendMessage(text: string, replyToEventId?: EventId): Promise<void> {
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

  /**
   * Стикер уже лежит на сервере — ни загрузки, ни ожидания mxc. Цитату не переносим: её поля
   * нет в `RoomStickerContentDto`, и связь была бы молча потеряна. Баннер ответа при этом
   * снимаем, как на всех остальных путях отправки.
   */
  async sendSticker(sticker: StickerItem): Promise<void> {
    const connection = this.requireConnection()
    if (!connection) return

    const message = createOptimisticStickerMessage({
      sender: connection.identity.userId,
      sticker,
    })
    this.dispatch({ type: 'message.optimisticAdded', message })
    this.dispatch({ type: 'reply.cleared' })

    await this.dispatchSend(connection.identity.roomId, message, 'sendSticker')
  }

  async sendCardAction(cardEventId: EventId, action: CardAction): Promise<void> {
    const connection = this.requireConnection()
    if (!connection) return

    const existing = connection.room.cardAnswers[cardEventId]
    if (existing?.status === 'sending' || existing?.status === 'sent') return

    this.dispatch({ type: 'card.answering', cardEventId, actionId: action.id })
    const signal = this.generation.signal

    // txnId переживает неудачную попытку: это ключ идемпотентности PUT /send. Если ответ
    // потерялся уже после записи события (обрыв, 502 от прокси), повтор с тем же ключом
    // вернёт тот же event_id, а не создаст второе kc.adaptive.action — иначе бот ветвился бы
    // по одной карточке дважды.
    const txnKey = `${cardEventId}#${action.id}`
    const txnId: TxnId = this.cardActionTxnIds.get(txnKey) ?? crypto.randomUUID()
    this.cardActionTxnIds.set(txnKey, txnId)

    try {
      await this.api.sendMessage({
        roomId: connection.identity.roomId,
        txnId,
        eventType: MatrixEventType.RoomMessage,
        content: toAdaptiveActionContent(cardEventId, action),
      })
      if (signal.aborted) return

      this.cardActionTxnIds.delete(txnKey)
      this.dispatch({ type: 'card.answered', cardEventId })
    } catch (err) {
      if (signal.aborted) return

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

    const signal = this.generation.signal

    const outcome = await this.media.upload(localId, file, {
      contentType: content.info.mimetype,
      onProgress: (pct) => this.dispatch({ type: 'message.uploadProgress', localId, pct }),
    })
    if (outcome.status === 'aborted' || signal.aborted) return null

    if (outcome.status === 'failed') {
      this.dispatch({ type: 'message.failed', localId, upload: classifyUploadError(outcome.error) })
      this.handleAuthError(outcome.error, context)
      return null
    }

    this.dispatch({ type: 'message.uploaded', localId, url: outcome.url })

    return { ...draft, content: { ...content, url: outcome.url } }
  }

  cancelUpload(localId: LocalId): void {
    // Черновик убираем и без живой заливки: так крестик снимает упавший rejected-файл.
    this.media.cancel(localId)
    this.dispatch({ type: 'message.discarded', localId })
  }

  private stopSessionActivity(): void {
    this.stopLoadingHistory()

    this.unwatchNetwork?.()
    this.unwatchNetwork = null

    for (const localId of this.media.abortAll()) {
      // Заливку оборвали мы сами, сервер ничего не решал: причина заведомо повторяемая.
      this.dispatch({ type: 'message.failed', localId, upload: 'network' })
    }

    this.syncLoop.stop()
  }

  async resendMessage(localId: LocalId): Promise<void> {
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

  async markRead(eventId: EventId): Promise<void> {
    const connection = this.requireConnection()
    if (!connection) return

    const { identity, room } = connection

    const currentMarker = room.readReceipts[identity.userId]?.eventId ?? null
    if (!canMoveMarker(room.timeline, currentMarker, eventId)) return

    // Двигаем маркер ДО запроса, потому что гард выше смотрит именно в стор.
    // Иначе, пока летит POST, стор хранит старый маркер, и каждый скан (скролл, новое сообщение)
    // снова проходил бы гард и слал тот же POST.
    this.dispatch({ type: 'receipt.markedRead', userId: identity.userId, eventId })
    const signal = this.generation.signal

    try {
      await this.api.sendReadReceipt(identity.roomId, eventId)
    } catch (err) {
      if (signal.aborted) return

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

  // Своя реакция на сообщение одна: повторный выбор снимает её, другой — заменяет. Механика —
  // в MatrixReactions; про смену сессии она узнаёт через reset() в nextGeneration().
  async toggleReaction(targetEventId: EventId, key: string): Promise<void> {
    await this.reactions.toggle(targetEventId, key)
  }

  // Механика догрузки живёт в MatrixHistoryLoader; контроллер даёт ей только, откуда тянуть.
  // Про смену сессии лоадер узнаёт через stop() в stopSessionActivity — без него поздняя
  // страница прежней сессии доехала бы в ленту новой.
  async loadMoreHistory(): Promise<void> {
    await this.historyLoader.load({
      getCursor: () => {
        const connection = this.requireConnection()

        if (!connection || connection.room.prevBatch === null) return

        return {
          roomId: connection.identity.roomId,
          prevBatch: connection.room.prevBatch,
        }
      },
    })
  }

  stopLoadingHistory(): void {
    this.historyLoader.stop()
  }

  private async dispatchSend(
    roomId: RoomId,
    message: OutgoingTimelineItem,
    context: AuthErrorContext,
  ): Promise<void> {
    const localId = message.localId
    const signal = this.generation.signal

    try {
      const { event_id } = await this.api.sendMessage({
        roomId,
        txnId: message.txnId!,
        // Тип события считаем из элемента, а не из места вызова: так и повтор упавшего
        // стикера уходит на m.sticker, а не на m.room.message.
        eventType: outgoingEventType(message),
        content: toMessageContent(message),
      })
      if (signal.aborted) return

      this.dispatch({ type: 'message.sent', localId, eventId: event_id })
    } catch (err) {
      if (signal.aborted) return

      this.dispatch({ type: 'message.failed', localId })

      // sync-петля не обязательно первой заметит мёртвую сессию — отправка может
      // словить ту же auth-ошибку раньше следующего long-poll.
      this.handleAuthError(err, context)
    }
  }

  private async runConnectFlow(
    phase: 'connecting' | 'recovering',
    establish: () => Promise<GuestSession>,
    onFailure: (err: unknown) => void,
  ): Promise<void> {
    const signal = this.generation.signal
    this.dispatch({ type: phase === 'recovering' ? 'session.recovering' : 'session.starting' })

    try {
      const session = await establish()
      if (signal.aborted) return

      this.dispatch({
        type: 'session.started',
        identity: { userId: session.userId, roomId: session.roomId },
        cursor: session.cursor,
        room: toRoomSyncPatch(session.initialRoom),
      })
      this.syncFailures = 0
      this.syncLoop.start({
        cursor: session.cursor,
        onTick: this.handleSyncTick,
        onError: this.handleSyncError,
      })
      this.watchNetwork()
    } catch (err) {
      if (signal.aborted) return

      onFailure(err)
      this.dispatch({ type: 'session.failed' })
    }
  }

  // События браузера — быстрый, но неполный источник. `offline` он зря не шлёт, поэтому это
  // готовый вердикт о потере: ждать падений запросов незачем, зависший long-poll их может и не
  // дать. Обратное неверно — при полуоткрытом коннекте (уснувший Wi-Fi, отвалившийся VPN,
  // съевший соединение прокси) интерфейс на месте и события не будет вовсе; там потерю ловит
  // только счётчик запросов, оставшихся без ответа. `online` же ничего не доказывает (за
  // роутером без интернета придёт тот же самый) и лишь торопит попытку — вердикт о
  // восстановлении по-прежнему выносит успешный sync.
  private watchNetwork(): void {
    if (this.unwatchNetwork) return

    const onOffline = () => {
      this.markOffline()
      this.restartSync()
    }
    const onOnline = () => this.restartSync()

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)

    this.unwatchNetwork = () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }

  // На `offline` перезапускаем петлю: stop() инвалидирует поколение текущего long-poll, поэтому
  // его поздний ответ уже не сможет снять баннер, а новый start() сохраняет самостоятельное
  // восстановление, даже если событие `online` не придёт. На `online` тот же рестарт рвёт запрос,
  // который мог зависнуть в мёртвом коннекте, и возвращает задержку к базовой. Сессию и ленту
  // при этом не трогаем.
  private restartSync(): void {
    const { cursor, phase } = this.getState()
    if (phase !== 'ready' || cursor === null) return

    this.syncLoop.stop()
    this.syncLoop.start({
      cursor,
      onTick: this.handleSyncTick,
      onError: this.handleSyncError,
    })
  }

  private handleSyncTick = (tick: SyncTick): void => {
    this.markOnline()

    const roomId = this.getState().identity?.roomId ?? null
    const joinedRoom = roomId ? (tick.response.rooms?.join?.[roomId] ?? null) : null

    this.dispatch({
      type: 'sync.received',
      cursor: tick.next,
      ...(joinedRoom ? { room: toRoomSyncPatch(joinedRoom) } : {}),
    })
  }

  private handleSyncError = (err: unknown, meta: { backoff: number }): void => {
    // Auth-ошибка — это не потеря связи: сервер ответил, просто сессия мертва.
    // Её лечит recovery, и баннер «нет соединения» там только соврал бы.
    if (this.handleAuthError(err, 'sync')) return

    consoleDev.error(`sync error, retrying in up to ${meta.backoff} ms`, err)

    // Считаем любой сбой, кроме auth. Строка в шапке отвечает на вопрос «доходят ли до нас
    // события», а не «есть ли интернет»: причину из браузера всё равно не узнать (мёртвая сеть
    // и мёртвый сервер дают один и тот же TypeError), а молчать при лежащем бэкенде хуже, чем
    // сказать нейтральное «Устанавливаем соединение…».
    this.syncFailures += 1

    // Свой дедлайн — это уже отсчитанные десятки секунд тишины, ждать второго провала незачем.
    // Остальным сбоям порог нужен: они возвращаются мгновенно и часто проходят со второго раза.
    if (isDeadlineError(err) || this.syncFailures >= OFFLINE_AFTER_FAILURES) this.markOffline()
  }

  // Потерю связи объявляем один раз: сюда ведут оба сигнала — счётчик провалов и событие
  // браузера, и прийти они могут в любом порядке. Мнение о связи одно и живёт в сторе:
  // своя копия здесь разъезжалась бы с ним при сбросе сессии.
  private markOffline(): void {
    if (!this.getState().online) return

    this.dispatch({ type: 'network.lost' })
  }

  // Успешный тик — доказательство связи, и оно сильнее мнения браузера: `navigator.onLine`
  // врёт в обе стороны (MDN прямо называет его подсказкой), а ответ сервера — факт. Ответы
  // поколения, работавшего до `offline`, сюда не попадут: их отсекает поколение внутри syncLoop.
  //
  // Зовётся на каждый успешный тик, поэтому дешёвая проверка стора вместо dispatch'а:
  // редьюсер и так вернул бы то же состояние, но devtools собирали бы пустой экшен раз в 25 секунд.
  private markOnline(): void {
    this.syncFailures = 0
    if (this.getState().online) return

    this.dispatch({ type: 'network.restored' })
  }

  private handleAuthError(err: unknown, context: AuthErrorContext): boolean {
    if (isUserDeactivatedError(err)) {
      consoleDev.error(`${context} user deactivated`, err)
      this.failSession()
      return true
    }

    if (isMatrixAuthError(err)) {
      this.recoverFromAuthError(err, context)
      return true
    }

    return false
  }

  // Новый гость — новое поколение: поздние ответы умершей сессии отсекаются.
  private recoverFromAuthError(err: unknown, context: AuthErrorContext): void {
    consoleDev.error(`${context} auth error`, err)
    this.stopSessionActivity()
    this.nextGeneration()

    void this.runConnectFlow(
      'recovering',
      () => this.sessionManager.resetGuestSession(),
      (err) => consoleDev.error('session recovery failed', err),
    )
  }

  private failSession(): void {
    this.stopSessionActivity()
    this.nextGeneration()
    this.sessionManager.clearSession()
    this.dispatch({ type: 'session.failed' })
  }

  private nextGeneration(): void {
    this.generation.begin()
    // Смена сессии — смена прав на медиа: чужие байты в кэше держать нельзя.
    this.media.reset()
    // Ключи идемпотентности привязаны к событиям прежней комнаты и в новой сессии бессмысленны.
    this.cardActionTxnIds.clear()
    this.reactions.reset()
  }

  private requireConnection(): {
    identity: NonNullable<ChatRuntimeState['identity']>
    room: ChatRuntimeState['room']
  } | null {
    const { identity, phase, room } = this.getState()

    if (phase !== 'ready' || !identity) {
      return null
    }
    return { identity, room }
  }
}
