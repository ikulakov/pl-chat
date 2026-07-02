import { sleep } from '../shared/sleep'
import type { JoinedRoom } from '../types/matrix'
import type { SyncResponse } from '../types/requests'
import { matrixApi } from './matrixApi'

export interface SyncTick {
  since: string
  next: string
  response: SyncResponse
  joinedRoom: JoinedRoom | null
}

interface SyncLoopOptions {
  cursor: string
  roomId: string
  onTick: (tick: SyncTick) => void
  onError?: ((error: unknown, meta: { since: string; backoff: number }) => void) | undefined
}

const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

type SyncApi = Pick<typeof matrixApi, 'longPollSync'>

export class MatrixSyncLoop {
  private readonly api: SyncApi
  private isRunning = false
  private abort: AbortController | null = null
  private cursor: string | null = null
  private roomId: string | null = null
  private onTick: ((tick: SyncTick) => void) | null = null
  private onError: ((error: unknown, meta: { since: string; backoff: number }) => void) | null =
    null

  constructor(api: SyncApi = matrixApi) {
    this.api = api
  }

  start(options: SyncLoopOptions): void {
    if (this.isRunning) return

    this.cursor = options.cursor
    this.roomId = options.roomId
    this.onTick = options.onTick
    this.onError = options.onError ?? null
    this.isRunning = true
    void this.run()
  }

  stop(): void {
    this.isRunning = false
    this.abort?.abort()
    this.abort = null
  }

  private async run(): Promise<void> {
    let backoff = INITIAL_BACKOFF_MS

    while (this.isRunning) {
      const cursor = this.cursor
      const roomId = this.roomId
      if (!cursor || !roomId) break

      const abort = new AbortController()
      this.abort = abort

      try {
        const response = await this.api.longPollSync(cursor, { signal: abort.signal })
        if (!this.isRunning) break

        backoff = INITIAL_BACKOFF_MS
        this.cursor = response.next_batch
        this.onTick?.({
          since: cursor,
          next: response.next_batch,
          response,
          joinedRoom: response.rooms?.join?.[roomId] ?? null,
        })
      } catch (err) {
        if (!this.isRunning || abort.signal.aborted) break

        this.onError?.(err, { since: cursor, backoff })
        await sleep(backoff)
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
      } finally {
        if (this.abort === abort) this.abort = null
      }
    }

    this.isRunning = false
  }
}
