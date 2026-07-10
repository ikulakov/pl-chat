import { describe, expect, it, vi } from 'vitest'
import { deferred, ROOM_ID, syncResponse } from '../../shared/testUtils/matrixFixtures'
import type { SyncResponse } from '../dto'
import type { MatrixApi } from '../matrixApi'
import { MatrixSyncLoop, type SyncTick } from './syncLoop'

vi.mock('../../shared/sleep', () => ({ sleep: () => Promise.resolve() }))

type LongPoll = MatrixApi['longPollSync']

describe('MatrixSyncLoop', () => {
  it('calls onTick with advancing cursor and the raw sync response', async () => {
    const ticks: SyncTick[] = []
    const longPollSync = vi.fn<LongPoll>()
    const loop = new MatrixSyncLoop({ longPollSync })

    let calls = 0
    longPollSync.mockImplementation(async () => {
      calls += 1
      if (calls >= 2) loop.stop()
      return syncResponse('c1')
    })

    loop.start({ cursor: 'c0', onTick: (t) => ticks.push(t) })
    await vi.waitFor(() => expect(ticks.length).toBeGreaterThan(0))

    expect(ticks[0]!.since).toBe('c0')
    expect(ticks[0]!.next).toBe('c1')
    expect(ticks[0]!.response.rooms?.join?.[ROOM_ID]).toBeDefined()
  })

  it('chains the cursor: each poll uses the previous next_batch as since', async () => {
    const sinces: string[] = []
    const longPollSync = vi.fn<LongPoll>()
    const loop = new MatrixSyncLoop({ longPollSync })

    let calls = 0
    longPollSync.mockImplementation(async (since) => {
      sinces.push(since)
      calls += 1
      if (calls >= 3) loop.stop()
      return syncResponse(`c${calls}`)
    })

    loop.start({ cursor: 'c0', onTick: () => {} })
    await vi.waitFor(() => expect(sinces.length).toBeGreaterThanOrEqual(3))
    loop.stop()

    expect(sinces.slice(0, 3)).toEqual(['c0', 'c1', 'c2'])
  })

  it('backs off exponentially and caps at MAX_BACKOFF_MS (30s)', async () => {
    const backoffs: number[] = []
    const longPollSync = vi.fn<LongPoll>()
    const loop = new MatrixSyncLoop({ longPollSync })

    longPollSync.mockImplementation(async () => {
      if (backoffs.length >= 7) loop.stop()
      throw new Error('boom')
    })

    loop.start({
      cursor: 'c0',
      onTick: () => {},
      onError: (_err, meta) => backoffs.push(meta.backoff),
    })
    await vi.waitFor(() => expect(backoffs.length).toBeGreaterThanOrEqual(7))
    loop.stop()

    expect(backoffs.slice(0, 7)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000])
  })

  it('resets backoff to the initial value after a successful tick', async () => {
    const backoffs: number[] = []
    const longPollSync = vi.fn<LongPoll>()
    const loop = new MatrixSyncLoop({ longPollSync })

    let calls = 0
    longPollSync.mockImplementation(async () => {
      calls += 1
      if (calls === 3) return syncResponse('c1') // успех сбрасывает backoff
      if (calls >= 5) {
        loop.stop()
        return syncResponse('c1')
      }
      throw new Error('boom') // calls 1, 2, 4
    })

    loop.start({
      cursor: 'c0',
      onTick: () => {},
      onError: (_err, meta) => backoffs.push(meta.backoff),
    })
    await vi.waitFor(() => expect(backoffs.length).toBeGreaterThanOrEqual(3))
    loop.stop()

    expect(backoffs.slice(0, 3)).toEqual([1000, 2000, 1000])
  })

  it('start() is idempotent: a second call while running does not spawn another poll', async () => {
    const longPollSync = vi.fn<LongPoll>(() => new Promise<SyncResponse>(() => {}))
    const loop = new MatrixSyncLoop({ longPollSync })

    loop.start({ cursor: 'c0', onTick: () => {} })
    await vi.waitFor(() => expect(longPollSync).toHaveBeenCalledTimes(1))

    loop.start({ cursor: 'cX', onTick: () => {} })

    expect(longPollSync).toHaveBeenCalledTimes(1)
    expect(longPollSync).toHaveBeenLastCalledWith('c0', expect.anything())
    loop.stop()
  })

  it('stop() aborts the in-flight poll', async () => {
    let signal: AbortSignal | undefined
    const longPollSync = vi.fn<LongPoll>((_since, options) => {
      signal = options?.signal ?? undefined
      return new Promise<SyncResponse>(() => {})
    })
    const loop = new MatrixSyncLoop({ longPollSync })

    loop.start({ cursor: 'c0', onTick: () => {} })
    await vi.waitFor(() => expect(longPollSync).toHaveBeenCalled())
    loop.stop()

    expect(signal?.aborted).toBe(true)
  })

  it('a stale run() that outlives a fast stop()+start() does not kill the new run()', async () => {
    const oldPoll = deferred<SyncResponse>()
    const newPoll = deferred<SyncResponse>()
    const ticks: SyncTick[] = []
    const longPollSync = vi.fn<LongPoll>(async (since) => {
      if (since === 'c0') return oldPoll.promise
      if (since === 'c1') return newPoll.promise
      return new Promise<SyncResponse>(() => {})
    })
    const loop = new MatrixSyncLoop({ longPollSync })

    loop.start({ cursor: 'c0', onTick: (t) => ticks.push(t) })
    await vi.waitFor(() => expect(longPollSync).toHaveBeenCalledWith('c0', expect.anything()))

    loop.stop()
    loop.start({ cursor: 'c1', onTick: (t) => ticks.push(t) })
    await vi.waitFor(() => expect(longPollSync).toHaveBeenCalledWith('c1', expect.anything()))

    // The aborted old poll settles only after the new run has already started —
    // it must not be able to stomp on the new run's state.
    oldPoll.reject(new DOMException('Aborted', 'AbortError'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    newPoll.resolve(syncResponse('c2'))

    await vi.waitFor(() => expect(ticks.length).toBeGreaterThan(0))
    expect(ticks[0]!.next).toBe('c2')
    await vi.waitFor(() => expect(longPollSync).toHaveBeenCalledWith('c2', expect.anything()))
  })
})
