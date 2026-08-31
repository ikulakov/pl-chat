import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmojiAnimation } from '../../domain/emoji'
import { createBatchedLoader } from './animationBatcher'

/** Окно сбора закрываем вручную: иначе каждая проверка ждала бы реальные 16 мс. */
function makeWindow() {
  let pending: (() => void) | null = null

  return {
    schedule: (flush: () => void) => {
      pending = flush
    },
    close: () => {
      const flush = pending
      pending = null
      flush?.()
    },
  }
}

const VERSION = 'mock-1'

const loadBatch = vi.fn(
  (codepoints: string[]): Promise<Record<string, EmojiAnimation>> =>
    Promise.resolve(Object.fromEntries(codepoints.map((cp) => [cp, { nm: cp }]))),
)
const loadOne = vi.fn(
  (codepoint: string): Promise<EmojiAnimation> => Promise.resolve({ nm: `single-${codepoint}` }),
)

function makeLoader(window = makeWindow()) {
  return {
    window,
    load: createBatchedLoader({ loadBatch, loadOne, schedule: window.schedule }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  loadBatch.mockImplementation((codepoints: string[]) =>
    Promise.resolve(Object.fromEntries(codepoints.map((cp) => [cp, { nm: cp }]))),
  )
  loadOne.mockImplementation((codepoint: string) => Promise.resolve({ nm: `single-${codepoint}` }))
})

describe('createBatchedLoader', () => {
  it('склеивает заявки одного окна в один запрос', async () => {
    const { window, load } = makeLoader()

    const requests = [load('1f600', VERSION), load('1f602', VERSION), load('2764', VERSION)]
    window.close()

    await expect(Promise.all(requests)).resolves.toEqual([
      { nm: '1f600' },
      { nm: '1f602' },
      { nm: '2764' },
    ])
    // Ровно ради этого всё и затевалось: 45 ячеек сетки — один round-trip, а не 45.
    expect(loadBatch).toHaveBeenCalledExactlyOnceWith(['1f600', '1f602', '2764'], VERSION)
    expect(loadOne).not.toHaveBeenCalled()
  })

  it('одно эмодзи в нескольких местах уезжает в пачку один раз', async () => {
    const { window, load } = makeLoader()

    const requests = [load('1f600', VERSION), load('1f600', VERSION)]
    window.close()

    await expect(Promise.all(requests)).resolves.toEqual([{ nm: '1f600' }, { nm: '1f600' }])
    expect(loadBatch).toHaveBeenCalledExactlyOnceWith(['1f600'], VERSION)
  })

  it('позицию, которой не оказалось в ответе, переспрашивает поштучно', async () => {
    loadBatch.mockResolvedValue({ '1f600': { nm: '1f600' } })
    const { window, load } = makeLoader()

    const known = load('1f600', VERSION)
    const missing = load('1f602', VERSION)
    window.close()

    await expect(known).resolves.toEqual({ nm: '1f600' })
    // Сервер молча выбрасывает неизвестные позиции, а вызывающему нужен честный ответ.
    await expect(missing).resolves.toEqual({ nm: 'single-1f602' })
    expect(loadOne).toHaveBeenCalledExactlyOnceWith('1f602', VERSION)
  })

  it('упавшая пачка откатывается на поштучные запросы', async () => {
    loadBatch.mockRejectedValue(new Error('нет маршрута'))
    const { window, load } = makeLoader()

    const requests = [load('1f600', VERSION), load('1f602', VERSION)]
    window.close()

    await expect(Promise.all(requests)).resolves.toEqual([
      { nm: 'single-1f600' },
      { nm: 'single-1f602' },
    ])
  })

  it('после трёх упавших пачек перестаёт их слать', async () => {
    loadBatch.mockRejectedValue(new Error('нет маршрута'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { window, load } = makeLoader()

    for (let attempt = 0; attempt < 3; attempt++) {
      const request = load(`1f60${attempt}`, VERSION)
      window.close()
      await request
    }
    expect(loadBatch).toHaveBeenCalledTimes(3)

    await expect(load('2764', VERSION)).resolves.toEqual({ nm: 'single-2764' })
    // Сервер без маршрута не должен получать пачку на каждый кадр.
    expect(loadBatch).toHaveBeenCalledTimes(3)
  })

  it('отказ отдельной позиции доходит до вызывающего', async () => {
    loadBatch.mockResolvedValue({})
    loadOne.mockRejectedValue(new Error('нет такого эмодзи'))
    const { window, load } = makeLoader()

    const request = load('1f600', VERSION)
    window.close()

    await expect(request).rejects.toThrow('нет такого эмодзи')
  })

  it('не мешает в одной пачке разные версии пака', async () => {
    const { window, load } = makeLoader()

    const first = load('1f600', VERSION)
    // Версия — cache-buster в том же URL: пачка уходит с одним `v`, смешивать нельзя.
    const second = load('1f602', 'mock-2')
    window.close()

    await expect(Promise.all([first, second])).resolves.toEqual([{ nm: '1f600' }, { nm: '1f602' }])
    expect(loadBatch).toHaveBeenNthCalledWith(1, ['1f600'], VERSION)
    expect(loadBatch).toHaveBeenNthCalledWith(2, ['1f602'], 'mock-2')
  })

  it('полная пачка уходит не дожидаясь окна', async () => {
    const { load } = makeLoader()

    const requests = Array.from({ length: 100 }, (_, i) =>
      load(`1${i.toString(16).padStart(4, '0')}`, VERSION),
    )

    // Окно не закрывали: потолок пачки сработал сам.
    await expect(Promise.all(requests)).resolves.toHaveLength(100)
    expect(loadBatch).toHaveBeenCalledOnce()
  })
})
