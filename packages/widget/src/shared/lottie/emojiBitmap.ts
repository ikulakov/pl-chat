import { evictOldest } from '../utils/evictOldest'
import type { AnimationLoader } from './lottieCache'
import { createEmojiPlayer, loadLottiePlayer } from './lottiePlayer'
import { rasterizeSvg } from './rasterizeSvg'
import type { EmojiBitmapSize } from './types'

/**
 * Растеризация первого кадра эмодзи в data-URL.
 *
 * Цветных картинок сервер не отдаёт — только Lottie, поэтому даже статичное эмодзи в строке
 * приходится один раз отрисовать. Зато потом это обычный `<img src>`: все вхождения символа во
 * всех сообщениях делят одну декодированную картинку, и плеер им не нужен.
 *
 * Путь длиннее, чем хотелось бы (SVG → разметка → `<img>` → холст), но рисовать кадр
 * canvas-рендерером lottie напрямую нельзя: он не поддерживает track matte, см. lottiePlayer.
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

const SVG_NS = 'http://www.w3.org/2000/svg'

async function renderFirstFrame(
  codepoint: string,
  version: string,
  size: EmojiBitmapSize,
  load: AnimationLoader,
): Promise<string> {
  const [lottie, animationData] = await Promise.all([loadLottiePlayer(), load(codepoint, version)])

  // Контейнер уводим за экран, а не оставляем вне документа: плеер берёт размеры из layout'а,
  // а у оторванного узла их нет — кадр вышел бы пустым.
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = `position:absolute;left:-9999px;top:0;width:${size}px;height:${size}px`
  document.body.appendChild(host)

  let markup: string
  const player = createEmojiPlayer(lottie, { container: host, animationData })

  try {
    player.goToAndStop(0, true)

    const svg = host.querySelector('svg')
    if (!svg) throw new Error('[PLChat] lottie svg missing')

    // Сериализованному кадру нужны и namespace, и размеры: без них картинка либо не
    // разберётся вовсе, либо отрисуется в дефолтные 300×150.
    svg.setAttribute('xmlns', SVG_NS)
    svg.setAttribute('width', String(size))
    svg.setAttribute('height', String(size))
    markup = new XMLSerializer().serializeToString(svg)
  } finally {
    // Плеер живёт ровно одну отрисовку: дальше картинка сама по себе, а инстанс — только утечка.
    player.destroy()
    host.remove()
  }

  return rasterizeSvg(markup, size)
}
