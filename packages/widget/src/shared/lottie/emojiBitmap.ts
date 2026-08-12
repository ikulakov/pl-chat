import { createCanvasAnimation } from './canvasAnimation'
import { loadLottie } from './lottieModule'
import { evictOldest } from '../utils/evictOldest'
import type { EmojiBitmapSize, LottieJson } from './types'

/**
 * Растеризация первого кадра эмодзи в data-URL.
 *
 * Цветных картинок сервер не отдаёт — только Lottie, поэтому даже статичное эмодзи в строке
 * приходится один раз отрисовать. Зато потом это обычный `<img src>`: все вхождения символа во
 * всех сообщениях делят одну декодированную картинку, и плеер им не нужен.
 */

// Кадров держим много: PNG 64×64 весит килобайты, а промах кэша стоит новой отрисовки.
const MAX_CACHED_BITMAPS = 200

export type LottieLoader = (codepoint: string) => Promise<LottieJson>

const bitmaps = new Map<string, Promise<string>>()

export function getEmojiBitmap(
  codepoint: string,
  size: EmojiBitmapSize,
  load: LottieLoader,
): Promise<string> {
  const key = `${codepoint}@${size}`
  const cached = bitmaps.get(key)
  if (cached) return cached

  // Промис в кэше заодно дедуплицирует параллельные отрисовки одного эмодзи — их в ленте
  // столько же, сколько вхождений символа на экране.
  const request = renderFirstFrame(codepoint, size, load).catch((err: unknown) => {
    bitmaps.delete(key)
    throw err
  })

  bitmaps.set(key, request)
  evictOldest(bitmaps, MAX_CACHED_BITMAPS)

  return request
}

/** Нужен тестам и на случай смены версии пака: сами по себе кадры не протухают. */
export function clearEmojiBitmaps(): void {
  bitmaps.clear()
}

async function renderFirstFrame(
  codepoint: string,
  size: EmojiBitmapSize,
  load: LottieLoader,
): Promise<string> {
  const [lottie, animationData] = await Promise.all([loadLottie(), load(codepoint)])

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) throw new Error('[PLChat] canvas 2d context unavailable')

  const player = createCanvasAnimation(lottie, canvas, context, animationData, false)

  try {
    player.goToAndStop(0, true)
    return canvas.toDataURL('image/png')
  } finally {
    // Плеер живёт ровно одну отрисовку: дальше картинка сама по себе, а инстанс — только утечка.
    player.destroy()
  }
}
