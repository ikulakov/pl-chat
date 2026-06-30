import { describe, expect, it, vi } from 'vitest'
import type { JoinedRoom } from '../../types/matrix'
import type { SyncResponse } from '../../types/requests'
import type { matrixApi } from '../matrixApi'
import { MatrixSyncLoop, type SyncTick } from '../syncLoop'

vi.mock('../../shared/sleep', () => ({ sleep: () => Promise.resolve() }))

type LongPoll = typeof matrixApi.longPollSync

function emptyJoined(): JoinedRoom {
  return { state: { events: [] }, timeline: { events: [] } }
}

function syncResp(next: string): SyncResponse {
  return { next_batch: next, rooms: { join: { '!r:bank': emptyJoined() } } }
}

describe('MatrixSyncLoop', () => {
  it('calls onTick with advancing cursor and the joined room', async () => {
    const ticks: SyncTick[] = []
    const longPollSync = vi.fn<LongPoll>()
    const loop = new MatrixSyncLoop({ longPollSync })

    let calls = 0
    longPollSync.mockImplementation(async () => {
      calls += 1
      if (calls >= 2) loop.stop()
      return syncResp('c1')
    })

    loop.start({ cursor: 'c0', roomId: '!r:bank', onTick: (t) => ticks.push(t) })
    await vi.waitFor(() => expect(ticks.length).toBeGreaterThan(0))

    expect(ticks[0]!.since).toBe('c0')
    expect(ticks[0]!.next).toBe('c1')
    expect(ticks[0]!.joinedRoom).not.toBeNull()
  })

  it('passes joinedRoom=null when our room is absent from the tick', async () => {
    const ticks: SyncTick[] = []
    const longPollSync = vi.fn<LongPoll>()
    const loop = new MatrixSyncLoop({ longPollSync })

    let calls = 0
    longPollSync.mockImplementation(async () => {
      calls += 1
      if (calls >= 2) loop.stop()
      return { next_batch: 'c1', rooms: { join: {} } }
    })

    loop.start({ cursor: 'c0', roomId: '!r:bank', onTick: (t) => ticks.push(t) })
    await vi.waitFor(() => expect(ticks.length).toBeGreaterThan(0))

    expect(ticks[0]!.joinedRoom).toBeNull()
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
      return syncResp(`c${calls}`)
    })

    loop.start({ cursor: 'c0', roomId: '!r:bank', onTick: () => {} })
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
      roomId: '!r:bank',
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
      if (calls === 3) return syncResp('c1') // успех сбрасывает backoff
      if (calls >= 5) {
        loop.stop()
        return syncResp('c1')
      }
      throw new Error('boom') // calls 1, 2, 4
    })

    loop.start({
      cursor: 'c0',
      roomId: '!r:bank',
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

    loop.start({ cursor: 'c0', roomId: '!r:bank', onTick: () => {} })
    await vi.waitFor(() => expect(longPollSync).toHaveBeenCalledTimes(1))

    loop.start({ cursor: 'cX', roomId: '!other:bank', onTick: () => {} })

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

    loop.start({ cursor: 'c0', roomId: '!r:bank', onTick: () => {} })
    await vi.waitFor(() => expect(longPollSync).toHaveBeenCalled())
    loop.stop()

    expect(signal?.aborted).toBe(true)
  })
})
