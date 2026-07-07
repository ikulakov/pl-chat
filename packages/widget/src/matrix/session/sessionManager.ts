import { sleep } from '../../shared/sleep'
import type { JoinedRoom } from '../../types/matrix'
import type { SyncResponse } from '../../types/requests'
import type { MatrixApi } from '../matrixApi'
import { isMatrixAuthError, MatrixErrCode, MatrixError } from '../transport/matrixError'
import type { MatrixSessionStore } from './types'

const ROOM_VISIBILITY_RETRY_DELAYS_MS = [200, 500]
const MAX_SYNC_RETRIES = 3

export interface GuestSession {
  userId: string
  roomId: string
  cursor: string
  initialRoom: JoinedRoom
}

type SupportRoom = { roomId: string; initialRoom: JoinedRoom }

export class MatrixSessionManager {
  private readonly api: MatrixApi
  private readonly sessionStore: MatrixSessionStore

  constructor(api: MatrixApi, sessionStore: MatrixSessionStore) {
    this.api = api
    this.sessionStore = sessionStore
  }

  async establishSession(): Promise<GuestSession> {
    if (!this.sessionStore.getAccessToken()) {
      return this.startGuestSession()
    }
    try {
      return await this.resumeSession()
    } catch (err) {
      if (!isMatrixAuthError(err)) throw err

      return this.resetGuestSession()
    }
  }

  async resetGuestSession(): Promise<GuestSession> {
    this.sessionStore.clearSession()
    return this.startGuestSession()
  }

  clearSession(): void {
    this.sessionStore.clearSession()
  }

  private async startGuestSession(): Promise<GuestSession> {
    const guest = await this.api.registerGuest()
    this.sessionStore.setSession({
      accessToken: guest.access_token,
      refreshToken: guest.refresh_token ?? null,
      userId: guest.user_id,
    })

    const room = await this.waitForSupportRoom()
    if (!room) {
      this.sessionStore.clearSession()
      throw new MatrixError(MatrixErrCode.RoomNotFound, 'Support room not found')
    }

    return { userId: guest.user_id, ...room }
  }

  private async resumeSession(): Promise<GuestSession> {
    const userId = this.sessionStore.getUserId()
    if (!userId) {
      return this.resetGuestSession()
    }

    const room = await this.waitForSupportRoom()
    if (!room) {
      // Держим токен, чтобы обычный retry возобновил ту же сессию, а не регистрировал заново.
      throw new MatrixError(MatrixErrCode.RoomNotFound, 'Support room not found')
    }

    return { userId, ...room }
  }

  private findSupportRoom(sync: SyncResponse): SupportRoom | null {
    const join = sync.rooms?.join
    if (!join) return null

    // Клиент всегда в одной комнате — берём единственную запись join.
    const roomId = Object.keys(join)[0]
    if (!roomId) return null

    const initialRoom = join[roomId]
    if (!initialRoom) return null

    return { roomId, initialRoom }
  }

  private async waitForSupportRoom(): Promise<(SupportRoom & { cursor: string }) | null> {
    // room пишется при registerGuest(), но первый initialSync() гостя может опередить это.
    for (let attempt = 0; attempt < MAX_SYNC_RETRIES; attempt++) {
      const sync = await this.api.initialSync()
      const room = this.findSupportRoom(sync)

      if (room) {
        return { ...room, cursor: sync.next_batch }
      }
      const delayMs = ROOM_VISIBILITY_RETRY_DELAYS_MS[attempt]
      if (delayMs) {
        await sleep(delayMs)
      }
    }
    return null
  }
}
