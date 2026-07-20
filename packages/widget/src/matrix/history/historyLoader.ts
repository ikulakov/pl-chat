import { timelineEventsToItems } from '../../domain/eventMapping'
import { sleep } from '../../shared/sleep'
import type { RuntimeAction } from '../../store/state'
import { HISTORY_RETRY_BASE_MS, HISTORY_RETRY_MAX_MS, MAX_HISTORY_PAGES_PER_CALL } from '../consts'
import type { MatrixApi } from '../matrixApi'

export interface HistoryContext {
  roomId: string
  prevBatch: string
}

export interface HistoryLoadRequest {
  getContext: () => HistoryContext | null
  /** Сессионная ось отмены (поколение сессии владельца). Опрашивается на await-границах —
   *  в отличие от `stop()`, запрос в полёте не рвёт. */
  isStale: () => boolean
}

export interface HistoryLoaderDeps {
  api: Pick<MatrixApi, 'getRoomHistory'>
  dispatch: (action: RuntimeAction) => void
  /** Вернуть true, если ошибка терминальная (мёртвая сессия) — тогда ретрая не будет. */
  onAuthError: (err: unknown) => boolean
}

/**
 * Догрузка истории вверх: backoff-ретрай транзиентных ошибок + постраничный обход,
 * пока страница не даст видимых событий.
 *
 * Две ортогональные оси отмены:
 * - `stop()` — намерение пользователя (ушёл от верха). Рвёт и запрос в полёте, и паузу backoff.
 * - `isStale()` — разрушение сессии у владельца. Проверяется после каждого await.
 */
export class MatrixHistoryLoader {
  private readonly api: Pick<MatrixApi, 'getRoomHistory'>
  private readonly dispatch: (action: RuntimeAction) => void
  private readonly onAuthError: (err: unknown) => boolean

  private activeLoad: AbortController | null = null

  constructor(deps: HistoryLoaderDeps) {
    this.api = deps.api
    this.dispatch = deps.dispatch
    this.onAuthError = deps.onAuthError
  }

  async load({ getContext, isStale }: HistoryLoadRequest): Promise<void> {
    if (!getContext() || this.activeLoad) return

    const abort = new AbortController()
    this.activeLoad = abort
    this.dispatch({ type: 'history.loading' })

    let backoff = HISTORY_RETRY_BASE_MS

    try {
      while (!isStale() && !abort.signal.aborted) {
        const current = getContext()
        if (!current) return

        try {
          await this.loadVisiblePage(current.roomId, current.prevBatch, isStale, abort.signal)
          return
        } catch (err) {
          if (isStale() || abort.signal.aborted) return

          console.error('[PLChat] load history failed:', err)

          // Терминальная ошибка — retry бессмыслен, владелец уводит в recovery.
          if (this.onAuthError(err)) return

          // sleep прерывается сигналом — проверяем сразу после него.
          await sleep(backoff, abort.signal)
          if (isStale() || abort.signal.aborted) return

          // Транзиентную ошибку (сеть/5xx) ретраим с backoff без лимита попыток, пока сигнал жив.
          backoff = Math.min(backoff * 2, HISTORY_RETRY_MAX_MS)
        }
      }
    } finally {
      // Снимаем флаг по идентичности загрузки, isStale: stop() мог уже занулить
      // activeLoad и сам диспатчнуть settled — так избегаем двойного history.settled.
      if (this.activeLoad === abort) {
        this.activeLoad = null
        this.dispatch({ type: 'history.settled' })
      }
    }
  }

  stop(): void {
    const abort = this.activeLoad
    if (!abort) return

    this.activeLoad = null
    abort.abort()
    this.dispatch({ type: 'history.settled' })
  }

  // Тянет страницы от курсора, пропуская те, что не дали видимых событий: сервер считает limit
  // по сырым событиям, поэтому страница может состоять из m.reaction/m.room.member и т.п.
  // При throw — retry в load().
  private async loadVisiblePage(
    roomId: string,
    fromBatch: string,
    isStale: () => boolean,
    signal: AbortSignal,
  ): Promise<void> {
    let prevBatch = fromBatch

    for (let page = 0; page < MAX_HISTORY_PAGES_PER_CALL; page++) {
      const { chunk, end } = await this.api.getRoomHistory(roomId, prevBatch, signal)
      if (isStale() || signal.aborted) return

      // dir=b отдаёт chunk newest-first — разворачиваем в хронологический порядок ленты.
      const items = timelineEventsToItems([...chunk].reverse())
      // Пустой chunk — признак конца истории
      const nextBatch = chunk.length === 0 ? null : (end ?? null)

      this.dispatch({ type: 'history.loaded', items, prevBatch: nextBatch })

      if (items.length > 0 || nextBatch === null) return

      prevBatch = nextBatch
    }
  }
}
