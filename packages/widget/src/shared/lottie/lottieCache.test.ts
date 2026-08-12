import { describe, expect, it, vi } from 'vitest'
import { createLottieCache } from './lottieCache'

describe('lottieCache', () => {
  it('дедуплицирует параллельные запросы одного codepoint', async () => {
    const load = vi.fn().mockResolvedValue({ v: '5.7.4' })
    const cache = createLottieCache(load)

    const [first, second] = await Promise.all([cache.get('1f600', 'v1'), cache.get('1f600', 'v1')])

    expect(load).toHaveBeenCalledExactlyOnceWith('1f600', 'v1')
    expect(first).toBe(second)
  })

  it('разводит записи по версии пака', async () => {
    const load = vi.fn().mockResolvedValue({})
    const cache = createLottieCache(load)

    await cache.get('1f600', 'v1')
    await cache.get('1f600', 'v2')

    expect(load).toHaveBeenCalledTimes(2)
    expect(cache.size).toBe(2)
  })

  it('не держит упавший запрос — следующий показ пробует заново', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({ ok: true })
    const cache = createLottieCache(load)

    await expect(cache.get('1f600', 'v1')).rejects.toThrow('network')

    await expect(cache.get('1f600', 'v1')).resolves.toEqual({ ok: true })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('вытесняет самые давние записи по достижении потолка', async () => {
    const load = vi.fn().mockResolvedValue({})
    const cache = createLottieCache(load)

    // Потолок — 200 записей; 250 запросов гарантированно его перешагивают.
    for (let i = 0; i < 250; i++) {
      await cache.get(`cp${i}`, 'v1')
    }

    expect(cache.size).toBe(200)

    // Первая позиция вытеснена — за ней сходят в сеть повторно.
    load.mockClear()
    await cache.get('cp0', 'v1')
    expect(load).toHaveBeenCalledOnce()
  })
})
