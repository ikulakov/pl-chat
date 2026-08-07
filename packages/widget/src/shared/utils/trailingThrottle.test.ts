import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trailingThrottle } from './trailingThrottle'

describe('trailingThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('схлопывает серию вызовов в один отложенный, без лидирующего', () => {
    const fn = vi.fn()
    const run = trailingThrottle(fn, 100)

    run()
    run()
    run()
    expect(fn).not.toHaveBeenCalled() // лидирующего вызова нет

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('после срабатывания следующий вызов взводит таймер заново', () => {
    const fn = vi.fn()
    const run = trailingThrottle(fn, 100)

    run()
    vi.advanceTimersByTime(100)
    run()
    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('cancel снимает отложенный вызов и не мешает взвести таймер снова', () => {
    const fn = vi.fn()
    const run = trailingThrottle(fn, 100)

    run()
    run.cancel()
    vi.advanceTimersByTime(100)
    expect(fn).not.toHaveBeenCalled()

    run()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledOnce()
  })
})
