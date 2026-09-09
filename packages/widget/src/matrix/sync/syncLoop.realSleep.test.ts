import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MatrixApi } from '../api/matrixApi'
import { MatrixSyncLoop } from './syncLoop'

type LongPoll = MatrixApi['longPollSync']

describe('MatrixSyncLoop with real sleep', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('stop() during backoff sleep prevents the next poll', async () => {
    vi.useFakeTimers()
    const errors: unknown[] = []
    const longPollSync = vi.fn<LongPoll>().mockRejectedValue(new Error('boom'))
    const loop = new MatrixSyncLoop({ longPollSync })

    loop.start({
      cursor: 'c0',
      onTick: () => {},
      onError: (err) => errors.push(err),
    })

    await vi.waitFor(() => expect(errors).toHaveLength(1))
    loop.stop()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(longPollSync).toHaveBeenCalledTimes(1)
  })

  // Без vi.waitFor: он сам крутит фейковые таймеры и такой тест прошёл бы при любой паузе.
  // Проверяем ровно момент повтора, шагая таймерами вручную.
  it('джиттер разводит повторы: ждём 50–100% паузы, а не всю', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0) // нижняя граница джиттера — половина паузы
    const longPollSync = vi.fn<LongPoll>().mockRejectedValue(new Error('boom'))
    const loop = new MatrixSyncLoop({ longPollSync })

    loop.start({ cursor: 'c0', onTick: () => {}, onError: () => {} })
    await vi.advanceTimersByTimeAsync(0)
    expect(longPollSync).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(499)
    expect(longPollSync).toHaveBeenCalledTimes(1)

    // 500 мс — половина базовой секунды: без джиттера повтора здесь бы ещё не было.
    await vi.advanceTimersByTimeAsync(1)
    expect(longPollSync).toHaveBeenCalledTimes(2)

    loop.stop()
  })
})
