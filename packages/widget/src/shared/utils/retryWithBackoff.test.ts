import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { retryWithBackoff } from './retryWithBackoff'

const BASE = { baseMs: 100, maxMs: 400 }

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('пауза растёт вдвое до потолка, а onError видит backoff текущей попытки', async () => {
    const attempt = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockRejectedValueOnce(new Error('3'))
      .mockRejectedValueOnce(new Error('4'))
      .mockResolvedValue('ok')
    const onError = vi.fn((_err: unknown, _backoff: number) => false)

    const result = retryWithBackoff(attempt, {
      ...BASE,
      signal: new AbortController().signal,
      onError,
    })
    await vi.runAllTimersAsync()

    await expect(result).resolves.toBe('ok')
    expect(onError.mock.calls.map(([, backoff]) => backoff)).toEqual([100, 200, 400, 400])
  })

  it('abort во время паузы рвёт её и новой попытки не делает', async () => {
    const abort = new AbortController()
    const attempt = vi.fn<() => Promise<never>>().mockRejectedValue(new Error('down'))

    const result = retryWithBackoff(attempt, { ...BASE, signal: abort.signal })
    await vi.advanceTimersByTimeAsync(50)
    abort.abort()

    await expect(result).resolves.toBeNull()
    expect(attempt).toHaveBeenCalledOnce()
  })

  it('терминальная ошибка из onError прекращает повторы без паузы', async () => {
    const attempt = vi.fn<() => Promise<never>>().mockRejectedValue(new Error('auth'))

    const result = await retryWithBackoff(attempt, {
      ...BASE,
      signal: new AbortController().signal,
      onError: () => true,
    })

    expect(result).toBeNull()
    expect(attempt).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ответ, приехавший после отмены, не отдаётся даже успешным', async () => {
    const abort = new AbortController()
    // попытка сигнал не слушает — как ответ, обогнавший обрыв
    const attempt = vi.fn(() => {
      abort.abort()
      return Promise.resolve('late')
    })

    const result = await retryWithBackoff(attempt, { ...BASE, signal: abort.signal })

    expect(result).toBeNull()
  })

  it('onError, остановивший владельца, не запускает паузу', async () => {
    const abort = new AbortController()
    const attempt = vi.fn<() => Promise<never>>().mockRejectedValue(new Error('auth'))

    const result = await retryWithBackoff(attempt, {
      ...BASE,
      signal: abort.signal,
      // recovery по auth-ошибке гасит поколение, но сама ошибка не объявлена терминальной
      onError: () => {
        abort.abort()
        return false
      },
    })

    expect(result).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
