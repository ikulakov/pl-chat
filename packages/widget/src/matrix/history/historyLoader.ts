import type { RoomId } from '@/shared/types/ids'
import { consoleDev } from '@/shared/utils/consoleDev'
import { retryWithBackoff } from '@/shared/utils/retryWithBackoff'
import type { RuntimeAction } from '@/store/state'
import type { MatrixApi } from '../api/matrixApi'
import { collectCardAnswers } from '../mappers/adaptiveCard'
import { collectMediaVerdicts } from '../mappers/mediaStatus'
import { toReactionDelta } from '../mappers/reactions'
import { timelineEventsToItems } from '../mappers/timeline'

// Максимальное кол-во страниц для просмотра на случай если все события страницы будут не целевыми
const MAX_HISTORY_PAGES_PER_CALL = 5

// Базовая пауза перед ретраем догрузки истории и ее потолок; растёт вдвое каждую попытку (backoff).
const HISTORY_BACKOFF = { baseMs: 1_000, maxMs: 10_000 }

export interface HistoryContext {
  roomId: RoomId
  prevBatch: string
}

export interface HistoryLoadRequest {
  getCursor: () => HistoryContext | undefined
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
 * Отмена одна — `stop()`: рвёт и запрос в полёте, и паузу backoff. Зовут её и по жесту
 * (пользователь ушёл от верха), и при конце сессии у владельца: про сессии лоадер не знает,
 * поэтому поздняя страница прежней сессии не доедет в стор новой, только если владелец
 * остановил лоадер до её смены.
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

  async load({ getCursor }: HistoryLoadRequest): Promise<void> {
    if (!getCursor() || this.activeLoad) return

    const abort = new AbortController()
    this.activeLoad = abort
    this.dispatch({ type: 'history.loading' })

    try {
      // Транзиентную ошибку (сеть/5xx) ретраим с backoff без лимита попыток, пока не остановили.
      await retryWithBackoff(() => this.loadVisiblePage(getCursor, abort.signal), {
        ...HISTORY_BACKOFF,
        signal: abort.signal,
        onError: (err) => {
          // Терминальная ошибка — retry бессмыслен
          if (this.onAuthError(err)) return true

          consoleDev.error('load history failed', err)
          return false
        },
      })
    } finally {
      // Снимаем флаг по идентичности загрузки: stop() мог уже занулить activeLoad
      // и сам диспатчнуть settled — так избегаем двойного history.settled.
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

  // Одна попытка для retry в load(). Курсор перечитываем на каждой: пока ждали паузу, он мог
  // сдвинуться. Страницы тянем, пропуская те, что не дали видимых событий: сервер считает limit
  // по сырым событиям, поэтому страница может состоять из m.reaction/m.room.member и т.п.
  private async loadVisiblePage(
    getCursor: HistoryLoadRequest['getCursor'],
    signal: AbortSignal,
  ): Promise<void> {
    const cursor = getCursor()
    if (!cursor) return

    let prevBatch = cursor.prevBatch

    for (let page = 0; page < MAX_HISTORY_PAGES_PER_CALL; page++) {
      const { chunk, end } = await this.api.getRoomHistory(cursor.roomId, prevBatch, { signal })
      if (signal.aborted) return

      // dir=b отдаёт chunk newest-first — разворачиваем в хронологический порядок ленты.
      const reversed = [...chunk].reverse()

      const items = timelineEventsToItems(reversed)
      const cardAnswers = collectCardAnswers(reversed)
      const mediaVerdicts = collectMediaVerdicts(reversed)
      // Реакции едут даже со страницы без видимых сообщений — она обычно из них и состоит.
      const reactions = toReactionDelta(reversed)
      // Пустой chunk — признак конца истории
      const nextBatch = chunk.length === 0 ? null : (end ?? null)

      this.dispatch({
        type: 'history.loaded',
        items,
        cardAnswers,
        mediaVerdicts,
        reactions,
        prevBatch: nextBatch,
      })

      if (items.length > 0 || nextBatch === null) return

      prevBatch = nextBatch
    }
  }
}
