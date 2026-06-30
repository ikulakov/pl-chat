import type { ChatRuntimeState, RuntimeAction } from '../store/model'
import { createOptimisticTextMessage, startGuestSession } from './helpers'
import { type MatrixApi } from './matrixApi'
import { MatrixSyncLoop, type SyncTick } from './syncLoop'

export interface MatrixSession {
  connect: () => Promise<void>
  disconnect: () => void
  sendMessage: (text: string) => Promise<void>
}

export interface MatrixControllerDeps {
  api: MatrixApi
  dispatch: (action: RuntimeAction) => void
  getState: () => ChatRuntimeState
}

export class MatrixController implements MatrixSession {
  private readonly api: MatrixApi
  private readonly dispatch: (action: RuntimeAction) => void
  private readonly getState: () => ChatRuntimeState
  private readonly syncLoop: MatrixSyncLoop

  constructor(deps: MatrixControllerDeps) {
    this.api = deps.api
    this.dispatch = deps.dispatch
    this.getState = deps.getState
    this.syncLoop = new MatrixSyncLoop(deps.api)
  }

  async connect(): Promise<void> {
    const { phase } = this.getState()
    if (phase !== 'idle' && phase !== 'error') return

    this.dispatch({ type: 'connection.connecting' })

    try {
      const { userId, roomId, cursor, initialRoom } = await startGuestSession(this.api)

      this.dispatch({
        type: 'session.started',
        identity: { userId, roomId },
        cursor,
        joinedRoom: initialRoom,
      })

      this.syncLoop.start({
        cursor,
        roomId,
        onTick: this.handleSyncTick,
        onError: (err, meta) =>
          console.error('[PLChat] sync error, retrying in', meta.backoff, 'ms:', err),
      })
    } catch (err) {
      console.error('[PLChat] guestConnect failed:', err)
      this.syncLoop.stop()
      this.dispatch({ type: 'connection.failed', error: 'Не удалось подключиться' })
    }
  }

  private handleSyncTick = (tick: SyncTick): void => {
    this.dispatch(
      tick.joinedRoom
        ? { type: 'sync.received', cursor: tick.next, joinedRoom: tick.joinedRoom }
        : { type: 'sync.received', cursor: tick.next },
    )
  }

  disconnect(): void {
    this.syncLoop.stop()
  }

  async sendMessage(text: string): Promise<void> {
    const { identity } = this.getState()
    if (!identity) return

    const { message, txnId } = createOptimisticTextMessage(identity.userId, text)
    this.dispatch({ type: 'message.optimisticAdded', message })

    try {
      const { event_id } = await this.api.sendMessage(identity.roomId, txnId, text)
      this.dispatch({ type: 'message.sent', localId: message.localId, eventId: event_id })
    } catch {
      this.dispatch({ type: 'message.failed', localId: message.localId })
    }
  }
}
