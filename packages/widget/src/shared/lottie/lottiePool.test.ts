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

  it('одиночный прогон замирает на последнем кадре и снимает себя с пула', () => {
    const scheduler = makeScheduler()
    const pool = createLottiePool({ ...scheduler, prefersReducedMotion: () => false })
    const player = makePlayer()
    const onComplete = vi.fn()

    pool.acquire(player, { loop: false, onComplete })

    // 30 кадров при 30 fps — ровно секунда анимации.
    scheduler.tick(1000)
    scheduler.tick(2000)

    expect(player.goToAndStop).toHaveBeenLastCalledWith(29, true)
    // Оставленная в пуле завершённая запись тикала бы вхолостую до ухода эмодзи с экрана.
    expect(pool.size).toBe(0)
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('цикл по умолчанию перематывается на начало, а не останавливается', () => {
    const scheduler = makeScheduler()
    const pool = createLottiePool({ ...scheduler, prefersReducedMotion: () => false })
    const player = makePlayer()

    pool.acquire(player)
    scheduler.tick(1000)
    scheduler.tick(2000)

    expect(pool.size).toBe(1)
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

  it('при prefers-reduced-motion одиночный прогон сразу считается завершённым', () => {
    const scheduler = makeScheduler()
    const pool = createLottiePool({ ...scheduler, prefersReducedMotion: () => true })
    const onComplete = vi.fn()

    pool.acquire(makePlayer(), { loop: false, onComplete })

    // Иначе вызывающий навсегда остался бы в состоянии «играет»: повтор по клику не работал бы.
    expect(onComplete).toHaveBeenCalledOnce()
  })
})
