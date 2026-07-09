import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MatrixApi } from '../matrixApi'
import { MatrixSyncLoop } from '../sync/syncLoop'

type LongPoll = MatrixApi['longPollSync']

describe('MatrixSyncLoop with real sleep', () => {
  afterEach(() => {
    vi.useRealTimers()
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
})
