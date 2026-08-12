import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmojiAnimation } from '../../domain/emoji'
import { clearEmojiBitmaps, getEmojiBitmap } from './emojiBitmap'

const destroy = vi.fn()
const goToAndStop = vi.fn()
const resize = vi.fn()

vi.mock('./lottiePlayer', () => ({
  loadLottiePlayer: () =>
    Promise.resolve({ loadAnimation: () => ({ goToAndStop, destroy, resize }) }),
}))

// jsdom не рисует — canvas заглушен в test.setup.ts, оттуда же и этот data-URL.
const DATA_URL = 'data:image/png;base64,test'
const VERSION = 'mock-1'

beforeEach(() => {
  clearEmojiBitmaps()
  vi.clearAllMocks()
})

function makeLoader(): ReturnType<typeof vi.fn> {
  return vi.fn(() => Promise.resolve({} as EmojiAnimation))
}

describe('getEmojiBitmap', () => {
  it('рисует первый кадр и отдаёт data-URL', async () => {
    const load = makeLoader()

    await expect(getEmojiBitmap('1f600', VERSION, 64, load)).resolves.toBe(DATA_URL)

    // Размер задаётся явно — иначе плеер обнулит холст вне документа.
    expect(resize).toHaveBeenCalledWith(64, 64)
    expect(goToAndStop).toHaveBeenCalledWith(0, true)
    // Плеер живёт одну отрисовку.
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('дедуплицирует параллельные запросы одного эмодзи', async () => {
    const load = makeLoader()

    const [first, second] = await Promise.all([
      getEmojiBitmap('1f600', VERSION, 64, load),
      getEmojiBitmap('1f600', VERSION, 64, load),
    ])

    expect(first).toBe(second)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('держит размеры раздельно', async () => {
    const load = makeLoader()

    await getEmojiBitmap('1f600', VERSION, 64, load)
    await getEmojiBitmap('1f600', VERSION, 128, load)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('после смены версии пака рисует заново', async () => {
    const load = makeLoader()

    await getEmojiBitmap('1f600', VERSION, 64, load)
    await getEmojiBitmap('1f600', 'mock-2', 64, load)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('не кэширует упавшую отрисовку', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('нет байтов')))

    await expect(getEmojiBitmap('1f600', VERSION, 64, failing)).rejects.toThrow('нет байтов')
    await expect(getEmojiBitmap('1f600', VERSION, 64, failing)).rejects.toThrow('нет байтов')

    expect(failing).toHaveBeenCalledTimes(2)
  })
})
