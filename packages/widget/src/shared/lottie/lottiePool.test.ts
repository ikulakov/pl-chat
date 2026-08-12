import type { AnimationItem } from 'lottie-web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playInPool, resetPool } from './lottiePool'

// Кадр «через 100 мс» заведомо переживает троттлинг пула (~33 мс).
const TICK_MS = 100

let frameCallback: FrameRequestCallback | null = null
let cancelled: number[] = []

function makePlayer(): AnimationItem {
  return {
    totalFrames: 60,
    frameRate: 60,
    goToAndStop: vi.fn(),
  } as unknown as AnimationItem
}

function runFrame(timestamp: number): void {
  const callback = frameCallback
  frameCallback = null
  callback?.(timestamp)
}

function setReducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduce })),
  )
}

beforeEach(() => {
  frameCallback = null
  cancelled = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frameCallback = cb
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => cancelled.push(id))
  setReducedMotion(false)
})

afterEach(() => {
  resetPool()
  vi.unstubAllGlobals()
})

describe('playInPool', () => {
  it('крутит кадры зарегистрированного плеера', () => {
    const player = makePlayer()

    playInPool(player)
    runFrame(TICK_MS)

    // Первый вызов — сброс на нулевой кадр при регистрации, второй — тик пула.
    expect(player.goToAndStop).toHaveBeenCalledTimes(2)
    expect(vi.mocked(player.goToAndStop).mock.calls[1]?.[1]).toBe(true)
  })

  it('держит потолок одновременно играющих', () => {
    const players = Array.from({ length: 15 }, () => makePlayer())
    players.forEach((player) => playInPool(player))

    runFrame(TICK_MS)

    // Каждый получил сброс на нулевой кадр, но тик достался только первым двенадцати.
    const advanced = players.filter((p) => vi.mocked(p.goToAndStop).mock.calls.length > 1)
    expect(advanced).toHaveLength(12)
  })

  it('снятый плеер больше не тикает, а пустой пул останавливает rAF', () => {
    const player = makePlayer()
    const stop = playInPool(player)

    stop()
    expect(cancelled).toHaveLength(1)

    runFrame(TICK_MS)
    expect(player.goToAndStop).toHaveBeenCalledTimes(1)
  })

  it('при prefers-reduced-motion показывает первый кадр и не тикает', () => {
    setReducedMotion(true)
    const player = makePlayer()

    playInPool(player)

    expect(player.goToAndStop).toHaveBeenCalledExactlyOnceWith(0, true)
    expect(frameCallback).toBeNull()
  })
})
