import { consoleDev } from '@/shared/utils/consoleDev'
import { Generation } from '@/shared/utils/generation'
import { retryWithBackoff } from '@/shared/utils/retryWithBackoff'
import type { MatrixApi } from '../api/matrixApi'
import { isRateLimitedError } from '../api/matrixError'
import type * as Matrix from '../wire'
import { currentPresence } from './presence'

export interface SyncTick {
  since: string
  next: string
  response: Matrix.SyncResponse
}

interface SyncLoopOptions {
  cursor: string
  onTick: (tick: SyncTick) => void
  /** Сбой самого запроса /sync — перед паузой backoff. Ошибки `onTick` сюда не попадают. */
  onError?: (error: unknown, meta: { since: string; backoff: number }) => void
}

function jittered(ms: number): number {
  return ms * (0.5 + Math.random() / 2)
}

// На 429 сервер сам говорит, сколько ждать, и раньше этого повтор бессмысленен: он получит
// тот же 429. Своя лесенка остаётся нижней границей — подсказка её только удлиняет.
function retryDelay(err: unknown, backoff: number): number {
  const delay = jittered(backoff)
  const serverHint = isRateLimitedError(err) ? (err.retryAfterMs ?? 0) : 0
  return Math.max(delay, serverHint)
}

const SYNC_BACKOFF = { baseMs: 1_000, maxMs: 30_000, delay: retryDelay }

type SyncApi = Pick<MatrixApi, 'longPollSync'>

export class MatrixSyncLoop {
  private readonly api: SyncApi
  private isRunning = false
  // Каждый start() начинает новое поколение: stale run() не должен уметь остановить более новый,
  // а stop() заодно рвёт висящий long-poll и паузу backoff.
  private readonly generation = new Generation()
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
    void this.run(this.generation.begin())
  }

  stop(): void {
    this.isRunning = false
    this.generation.end()
  }

  private async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const cursor = this.cursor
      if (!cursor) break

      const response = await retryWithBackoff(
        () => this.api.longPollSync(cursor, { signal, setPresence: currentPresence() }),
        {
          ...SYNC_BACKOFF,
          signal,
          onError: (err, backoff) => {
            this.onError?.(err, { since: cursor, backoff })
            return false
          },
        },
      )
      if (!response || signal.aborted) break

      // Курсор двигаем ДО применения, как matrix-js-sdk: батч, на котором падает обработка,
      // пропускаем, а не запрашиваем по кругу — иначе битое событие заморозило бы чат.
      this.cursor = response.next_batch
      try {
        this.onTick?.({ since: cursor, next: response.next_batch, response })
      } catch (err) {
        consoleDev.error('sync tick failed, batch skipped', err)
      }
    }

    if (!signal.aborted) this.isRunning = false
  }
}
