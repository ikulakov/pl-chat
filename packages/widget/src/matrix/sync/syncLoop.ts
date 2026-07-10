import { sleep } from '../../shared/sleep'
import type { SyncResponse } from '../dto'
import type { MatrixApi } from '../matrixApi'

export interface SyncTick {
  since: string
  next: string
  response: SyncResponse
}

interface SyncLoopOptions {
  cursor: string
  onTick: (tick: SyncTick) => void
  onError?: (error: unknown, meta: { since: string; backoff: number }) => void
}

const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

type SyncApi = Pick<MatrixApi, 'longPollSync'>

export class MatrixSyncLoop {
  private readonly api: SyncApi
  private isRunning = false
  // Счётчик поколений: каждый start() начинает новый run;
  // предыдущий stale run() не должен уметь остановить более новый
  private runId = 0
  private abort: AbortController | null = null
  private cursor: string | null = null
  private onTick: ((tick: SyncTick) => void) | null = null
  private onError: ((error: unknown, meta: { since: string; backoff: number }) => void) | null =
    null

  constructor(api: SyncApi) {
    this.api = api
  }

  start(options: SyncLoopOptions): void {
    if (this.isRunning) return

    this.cursor = options.cursor
    this.onTick = options.onTick
    this.onError = options.onError ?? null
    this.isRunning = true
    const runId = ++this.runId
    void this.run(runId)
  }

  stop(): void {
    this.isRunning = false
    this.runId += 1
    this.abort?.abort()
    this.abort = null
  }

  private isCurrentRun(runId: number): boolean {
    return this.runId === runId
  }

  private async run(runId: number): Promise<void> {
    const abort = new AbortController()
    this.abort = abort
    let backoff = INITIAL_BACKOFF_MS

    while (this.isCurrentRun(runId)) {
      const cursor = this.cursor
      if (!cursor) break

      try {
        const response = await this.api.longPollSync(cursor, { signal: abort.signal })
        if (!this.isCurrentRun(runId)) break

        backoff = INITIAL_BACKOFF_MS
        this.cursor = response.next_batch

        this.onTick?.({ since: cursor, next: response.next_batch, response })
      } catch (err) {
        if (!this.isCurrentRun(runId) || abort.signal.aborted) break

        this.onError?.(err, { since: cursor, backoff })
        if (!this.isCurrentRun(runId)) break

        await sleep(backoff, abort.signal)
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
      }
    }

    if (this.isCurrentRun(runId)) this.isRunning = false
  }
}
