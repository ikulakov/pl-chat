import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmojiAnimation } from '../../domain/emoji'
import { clearEmojiBitmaps, getEmojiBitmap } from './emojiBitmap'

const destroy = vi.fn()
const goToAndStop = vi.fn()

// Плеер рисует кадр в контейнер: подкладываем туда пустой <svg>, из которого берётся разметка.
vi.mock('./lottiePlayer', () => ({
  loadLottiePlayer: () => Promise.resolve({}),
  createEmojiPlayer: (_lottie: unknown, { container }: { container: HTMLElement }) => {
    container.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    return { goToAndStop, destroy }
  },
}))

// jsdom не грузит ресурсы в <img>, поэтому растеризация подменена целиком — см. rasterizeSvg.
const DATA_URL = 'data:image/png;base64,test'
vi.mock('./rasterizeSvg', () => ({
  rasterizeSvg: () => Promise.resolve(DATA_URL),
}))

// IndexedDB в jsdom нет вовсе; здесь проверяется, что постоянный слой спрашивают до отрисовки
// и дописывают после — сам адаптер деградирует до `null` без него.
const readFrame = vi.fn(() => Promise.resolve<string | null>(null))
const writeFrame = vi.fn(() => Promise.resolve())
vi.mock('../emoji/emojiDb', () => ({
  readFrame: (...args: unknown[]) => readFrame(...(args as [])),
  writeFrame: (...args: unknown[]) => writeFrame(...(args as [])),
}))

const VERSION = 'mock-1'

beforeEach(() => {
  clearEmojiBitmaps()
  vi.clearAllMocks()
  readFrame.mockResolvedValue(null)
})

function makeLoader(): ReturnType<typeof vi.fn> {
  return vi.fn(() => Promise.resolve({} as EmojiAnimation))
}

describe('getEmojiBitmap', () => {
  it('рисует первый кадр и отдаёт data-URL', async () => {
    const load = makeLoader()

    await expect(getEmojiBitmap('1f600', VERSION, 64, load)).resolves.toBe(DATA_URL)

    expect(goToAndStop).toHaveBeenCalledWith(0, true)
    // Плеер живёт одну отрисовку.
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('не оставляет за собой контейнер отрисовки', async () => {
    const before = document.body.childElementCount

    await getEmojiBitmap('1f600', VERSION, 64, makeLoader())

    expect(document.body.childElementCount).toBe(before)
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

  it('кадр из постоянного кэша не рисуется заново и не качает байты', async () => {
    const load = makeLoader()
    readFrame.mockResolvedValue('data:image/png;base64,stored')

    await expect(getEmojiBitmap('1f600', VERSION, 64, load)).resolves.toBe(
      'data:image/png;base64,stored',
    )

    // Ровно ради этого постоянный слой и заводился: ни сети, ни отрисовки в новой сессии.
    expect(load).not.toHaveBeenCalled()
    expect(destroy).not.toHaveBeenCalled()
  })

  it('дописывает нарисованный кадр в постоянный кэш', async () => {
    await getEmojiBitmap('1f600', VERSION, 64, makeLoader())

    expect(writeFrame).toHaveBeenCalledExactlyOnceWith('1f600@mock-1@64', VERSION, DATA_URL)
  })

  it('не кэширует упавшую отрисовку', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('нет байтов')))

    await expect(getEmojiBitmap('1f600', VERSION, 64, failing)).rejects.toThrow('нет байтов')
    await expect(getEmojiBitmap('1f600', VERSION, 64, failing)).rejects.toThrow('нет байтов')

    expect(failing).toHaveBeenCalledTimes(2)
  })
})
