import type { ChatRuntimeState, RuntimeAction } from '../store/model'
import { type MatrixApi } from './matrixApi'
import { createOptimisticTextMessage } from './messages'
import type { GuestSession, MatrixSessionManager } from './session/sessionManager'
import { MatrixSyncLoop, type SyncTick } from './sync/syncLoop'
import { isMatrixAuthError, isUserDeactivatedError } from './transport/matrixError'

export const CONNECTION_FAILED_ERROR = 'Не удалось подключиться'

export interface MatrixService {
  connect: () => Promise<void>
  disconnect: () => void
  sendMessage: (text: string) => Promise<void>
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
  private readonly sessionManager: MatrixSessionManager

  private readonly dispatch: (action: RuntimeAction) => void
  private readonly getState: () => ChatRuntimeState

  private lifecycleId = 0
  private sessionRecovery: Promise<void> | null = null

  constructor(deps: MatrixControllerDeps) {
    this.api = deps.api
    this.syncLoop = new MatrixSyncLoop(deps.api)
    this.sessionManager = deps.sessionManager
    this.dispatch = deps.dispatch
    this.getState = deps.getState
  }

  async connect(): Promise<void> {
    const { phase } = this.getState()
    if (phase !== 'idle' && phase !== 'error') return

    const lifecycleId = this.nextLifecycle()

    await this.runConnectFlow(
      lifecycleId,
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
    this.nextLifecycle()
    this.syncLoop.stop()
  }

  async sendMessage(text: string): Promise<void> {
    const lifecycleId = this.lifecycleId
    const { identity, phase } = this.getState()

    if (phase !== 'connected' || !identity) return

    const { message, txnId } = createOptimisticTextMessage(identity.userId, text)
    this.dispatch({ type: 'message.optimisticAdded', message })

    try {
      const { event_id } = await this.api.sendMessage(identity.roomId, txnId, text)
      if (!this.isCurrentLifecycle(lifecycleId)) return

      this.dispatch({ type: 'message.sent', localId: message.localId, eventId: event_id })
    } catch (err) {
      if (!this.isCurrentLifecycle(lifecycleId)) return

      this.dispatch({ type: 'message.failed', localId: message.localId })

      // sync-петля не обязательно первой заметит мёртвую сессию — отправка может
      // словить ту же auth-ошибку раньше следующего long-poll.
      this.handleAuthError(err, 'sendMessage')
    }
  }

  private async runConnectFlow(
    lifecycleId: number,
    establish: () => Promise<GuestSession>,
    onFailure: (err: unknown) => void,
  ): Promise<void> {
    this.dispatch({ type: 'connection.connecting' })

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

  private handleAuthError(err: unknown, context: string): boolean {
    if (isUserDeactivatedError(err)) {
      console.error(`[PLChat] ${context} user deactivated:`, err)
      this.failTerminalSession()
      return true
    }

    if (isMatrixAuthError(err)) {
      this.recoverFromAuthError(err, context)
      return true
    }

    return false
  }

  private recoverFromAuthError(err: unknown, context: string): void {
    console.error(`[PLChat] ${context} auth error:`, err)
    this.syncLoop.stop()
    this.startSessionRecovery(this.lifecycleId)
  }

  private startSessionRecovery(lifecycleId: number): void {
    if (this.sessionRecovery) return

    const recovery = this.runConnectFlow(
      lifecycleId,
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

  private failTerminalSession(): void {
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
