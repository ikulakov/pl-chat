import { describe, expect, it, vi } from 'vitest'
import { createLottiePool, type PoolPlayer } from './lottiePool'

/** Управляемый rAF: тесты сами решают, когда и с каким временем случится кадр. */
function makeScheduler() {
  let pending: ((time: number) => void) | null = null

  return {
    requestFrame: (callback: (time: number) => void) => {
      pending = callback
      return 1
    },
    cancelFrame: () => {
      pending = null
    },
    tick: (time: number) => {
      const callback = pending
      pending = null
      callback?.(time)
    },
    get scheduled() {
      return pending !== null
    },
  }
}

function makePlayer(): PoolPlayer & { goToAndStop: ReturnType<typeof vi.fn> } {
  return { totalFrames: 30, frameRate: 30, goToAndStop: vi.fn() }
}

describe('lottiePool', () => {
  it('крутит один общий цикл на все плееры', () => {
    const scheduler = makeScheduler()
    const pool = createLottiePool({ ...scheduler, prefersReducedMotion: () => false })
    const a = makePlayer()
    const b = makePlayer()

    pool.acquire(a)
    pool.acquire(b)
    scheduler.tick(100)

    expect(a.goToAndStop).toHaveBeenCalledOnce()
    expect(b.goToAndStop).toHaveBeenCalledOnce()
    expect(pool.size).toBe(2)
  })

  it('играет не больше потолка одновременно', () => {
    const scheduler = makeScheduler()
    const pool = createLottiePool({ ...scheduler, prefersReducedMotion: () => false })
    const players = Array.from({ length: 30 }, makePlayer)

    players.forEach((player) => pool.acquire(player))
    scheduler.tick(100)

    const played = players.filter((player) => player.goToAndStop.mock.calls.length > 0)
    expect(played).toHaveLength(24)
    expect(pool.playing).toBe(24)
  })

  it('снятый плеер больше не тикает, а пустой пул останавливает цикл', () => {
    const scheduler = makeScheduler()
    const pool = createLottiePool({ ...scheduler, prefersReducedMotion: () => false })
    const player = makePlayer()

    const release = pool.acquire(player)
    release()

    expect(pool.size).toBe(0)
    expect(scheduler.scheduled).toBe(false)

    scheduler.tick(100)
    expect(player.goToAndStop).not.toHaveBeenCalled()
  })

  it('пропускает кадр, если интервал ещё не набежал', () => {
    const scheduler = makeScheduler()
    const pool = createLottiePool({ ...scheduler, prefersReducedMotion: () => false })
    const player = makePlayer()

    pool.acquire(player)
    scheduler.tick(1000)
    // 5 мс при цели в 30 fps (33 мс) — работать рано, но цикл должен продолжиться.
    scheduler.tick(1005)

    expect(player.goToAndStop).toHaveBeenCalledOnce()
    expect(scheduler.scheduled).toBe(true)
  })

  it('при prefers-reduced-motion показывает первый кадр и не заводит цикл', () => {
    const scheduler = makeScheduler()
    const pool = createLottiePool({ ...scheduler, prefersReducedMotion: () => true })
    const player = makePlayer()

    pool.acquire(player)

    expect(player.goToAndStop).toHaveBeenCalledExactlyOnceWith(0, true)
    expect(pool.size).toBe(0)
    expect(scheduler.scheduled).toBe(false)
  })
})
