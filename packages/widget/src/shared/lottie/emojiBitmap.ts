import type { EmojiAnimation } from '../../domain/emoji'
import { evictOldest } from '../utils/evictOldest'
import type { AnimationLoader } from './lottieCache'
import { loadLottiePlayer } from './lottiePlayer'
import type { EmojiBitmapSize, SizedAnimation } from './types'

/**
 * Растеризация первого кадра эмодзи в data-URL.
 *
 * Цветных картинок сервер не отдаёт — только Lottie, поэтому даже статичное эмодзи в строке
 * приходится один раз отрисовать. Зато потом это обычный `<img src>`: все вхождения символа во
 * всех сообщениях делят одну декодированную картинку, и плеер им не нужен.
 */

// Кадров держим много: PNG 64×64 весит килобайты, а промах кэша стоит новой отрисовки.
const MAX_CACHED_BITMAPS = 200

const bitmaps = new Map<string, Promise<string>>()

export function getEmojiBitmap(
  codepoint: string,
  version: string,
  size: EmojiBitmapSize,
  load: AnimationLoader,
): Promise<string> {
  // Версия в ключе: после переseed'а пака старый кадр не должен пережить обновление.
  const key = `${codepoint}@${version}@${size}`
  const cached = bitmaps.get(key)
  if (cached) return cached

  // Промис в кэше заодно дедуплицирует параллельные отрисовки одного эмодзи — их в ленте
  // столько же, сколько вхождений символа на экране.
  const request = renderFirstFrame(codepoint, version, size, load).catch((err: unknown) => {
    bitmaps.delete(key)
    throw err
  })

  bitmaps.set(key, request)
  evictOldest(bitmaps, MAX_CACHED_BITMAPS)

  return request
}

/** Нужен тестам: кадры сами по себе не протухают. */
export function clearEmojiBitmaps(): void {
  bitmaps.clear()
}

async function renderFirstFrame(
  codepoint: string,
  version: string,
  size: EmojiBitmapSize,
  load: AnimationLoader,
): Promise<string> {
  const [lottie, animationData] = await Promise.all([loadLottiePlayer(), load(codepoint, version)])

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) throw new Error('[PLChat] canvas 2d context unavailable')

  // Контейнер не передаём намеренно: увидев его, lottie создаёт свой холст внутри и
  // игнорирует переданный контекст — на выходе получилась бы пустая картинка. Свой контекст
  // он берёт только когда контейнера нет. В типах контейнер обязателен, отсюда приведение.
  const player = lottie.loadAnimation({
    renderer: 'canvas',
    loop: false,
    autoplay: false,
    animationData: animationData as EmojiAnimation,
    // dpr: 1 — плотность уже заложена в размер холста, иначе плеер домножит её ещё раз.
    rendererSettings: { context, clearCanvas: true, preserveAspectRatio: 'xMidYMid meet', dpr: 1 },
  } as unknown as Parameters<typeof lottie.loadAnimation>[0]) as SizedAnimation

  try {
    // Размер задаём явно: холст не в документе, и без этого плеер обнулил бы его.
    player.resize(size, size)
    player.goToAndStop(0, true)

    return canvas.toDataURL('image/png')
  } finally {
    // Плеер живёт ровно одну отрисовку: дальше картинка сама по себе, а инстанс — только утечка.
    player.destroy()
  }
}
