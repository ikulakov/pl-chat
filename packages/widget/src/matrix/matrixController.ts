import { createOptimisticTextMessage } from '../domain/optimistic'
import { canMoveMarker } from '../domain/receipts'
import { isSystem } from '../domain/timeline'
import type { ChatRuntimeState, RuntimeAction } from '../store/state'
import { MatrixHistoryLoader } from './history/historyLoader'
import { type MatrixApi } from './matrixApi'
import type { GuestSession, MatrixSessionManager } from './session/sessionManager'
import { MatrixSyncLoop, type SyncTick } from './sync/syncLoop'
import {
  isMatrixAuthError,
  isUserDeactivatedError,
  type AuthErrorContext,
} from './transport/matrixError'

export const CONNECTION_FAILED_ERROR = 'Не удалось подключиться'

export interface MatrixService {
  connect: () => Promise<void>
  disconnect: () => void
  sendMessage: (text: string) => Promise<void>
  resendMessage: (localId: string) => Promise<void>
  markRead: (eventId: string) => Promise<void>
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
    this.stopLoadingHistory()
    this.nextLifecycle()
    this.syncLoop.stop()
  }

  async sendMessage(text: string): Promise<void> {
    const { identity, phase } = this.getState()

    if (phase !== 'connected' || !identity) return

    const { message, txnId } = createOptimisticTextMessage(identity.userId, text)
    this.dispatch({ type: 'message.optimisticAdded', message })

    await this.dispatchSend(
      identity.roomId,
      message.localId,
      message.content.body,
      txnId,
      'sendMessage',
    )
  }

  async resendMessage(localId: string): Promise<void> {
    const { identity, phase, room } = this.getState()

    if (phase !== 'connected' || !identity) return

    const message = room.timeline.find((m) => m.localId === localId)

    if (!message || isSystem(message) || message.sendStatus !== 'failed' || !message.txnId) {
      return
    }

    this.dispatch({ type: 'message.retrying', localId })

    await this.dispatchSend(
      identity.roomId,
      localId,
      message.content.body,
      message.txnId,
      'resendMessage',
    )
  }

  async markRead(eventId: string): Promise<void> {
    const { identity, phase, room } = this.getState()

    if (phase !== 'connected' || !identity) return

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

  // Механика догрузки живёт в MatrixHistoryLoader; контроллер даёт ей только сессионный
  // контекст — откуда тянуть (getContext) и когда цикл устарел (isStale по поколению сессии).
  async loadMoreHistory(): Promise<void> {
    const lifecycleId = this.lifecycleId

    await this.historyLoader.load({
      getContext: () => {
        const { identity, phase, room } = this.getState()

        if (phase !== 'connected' || !identity || room.prevBatch === null) return null

        return { roomId: identity.roomId, prevBatch: room.prevBatch }
      },
      isStale: () => !this.isCurrentLifecycle(lifecycleId),
    })
  }

  stopLoadingHistory(): void {
    this.historyLoader.stop()
  }

  private async dispatchSend(
    roomId: string,
    localId: string,
    body: string,
    txnId: string,
    context: AuthErrorContext,
  ): Promise<void> {
    const lifecycleId = this.lifecycleId

    try {
      const { event_id } = await this.api.sendMessage(roomId, txnId, body)
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
        joinedRoom: session.initialRoom,
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

    this.dispatch(
      joinedRoom
        ? { type: 'sync.received', cursor: tick.next, joinedRoom }
        : { type: 'sync.received', cursor: tick.next },
    )
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
    this.stopLoadingHistory()
    this.syncLoop.stop()
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
    this.stopLoadingHistory()
    this.nextLifecycle()
    this.syncLoop.stop()
    this.sessionManager.clearSession()
    this.dispatch({ type: 'connection.failed', error: CONNECTION_FAILED_ERROR })
  }

  private nextLifecycle(): number {
    this.lifecycleId += 1
    this.sessionRecovery = null
    return this.lifecycleId
  }

  private isCurrentLifecycle(lifecycleId: number): boolean {
    return this.lifecycleId === lifecycleId
  }
}
