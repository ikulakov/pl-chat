import type { EmojiAnimation } from '../../domain/emoji'
import { readFrame, writeFrame } from '../emoji/emojiDb'
import { evictOldest } from '../utils/evictOldest'
import { createTaskQueue } from '../utils/taskQueue'
import type { AnimationLoader } from './lottieCache'
import { createEmojiPlayer, loadLottiePlayer } from './lottiePlayer'
import { rasterizeSvg } from './rasterizeSvg'
import type { EmojiBitmapSize } from './types'

/**
 * Первый кадр эмодзи картинкой: память → IndexedDB → отрисовка.
 *
 * Цветных картинок сервер не отдаёт — только Lottie, поэтому даже статичное эмодзи в строке
 * приходится один раз отрисовать. Зато потом это обычный `<img src>`: все вхождения символа во
 * всех сообщениях делят одну декодированную картинку, и плеер им не нужен.
 *
 * Путь отрисовки длиннее, чем хотелось бы (SVG → разметка → `<img>` → холст), но рисовать кадр
 * canvas-рендерером lottie напрямую нельзя: он не поддерживает track matte, см. lottiePlayer.
 * Ровно поэтому результат и уезжает в IndexedDB: HTTP-кэш снимает загрузку байтов, но не этот
 * путь, а он повторялся бы в каждой новой сессии на каждое эмодзи.
 */

// Кадров держим много: PNG 64×64 весит килобайты, а промах кэша стоит новой отрисовки.
const MAX_CACHED_BITMAPS = 200

// Потолок одновременных отрисовок. Видимая часть сетки пикера — ~45 ячеек, и без очереди они
// разом уходят и в сеть, и в главный поток: прокрутка встаёт на первом же экране.
const RENDER_LIMIT = 4

const bitmaps = new Map<string, Promise<string>>()
const renderQueue = createTaskQueue(RENDER_LIMIT)

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
  const request = resolveBitmap(key, codepoint, version, size, load).catch((err: unknown) => {
    bitmaps.delete(key)
    throw err
  })

  bitmaps.set(key, request)
  evictOldest(bitmaps, MAX_CACHED_BITMAPS)

  return request
}

async function resolveBitmap(
  key: string,
  codepoint: string,
  version: string,
  size: EmojiBitmapSize,
  load: AnimationLoader,
): Promise<string> {
  // Постоянный слой проверяем до очереди: попадание стоит одного чтения из IndexedDB и не
  // должно стоять за чужими отрисовками.
  const stored = await readFrame(key, version)
  if (stored) return stored

  // Загрузка идёт до очереди, а не внутри неё: заявки склеиваются в пачки (см.
  // `animationBatcher`), и за потолком очереди в полёте было бы максимум четыре codepoint'а —
  // склеивать оказалось бы нечего. Очередь защищает главный поток от отрисовок, к сети её
  // потолок отношения не имеет.
  const animationData = await load(codepoint, version)
  const url = await renderQueue.run(() => renderFirstFrame(animationData, size))

  // Запись не ждём: картинка уже готова, а неудача записи (квота, приватный режим) ничего не
  // меняет — в следующий раз кадр просто нарисуется заново.
  void writeFrame(key, version, url)

  return url
}

/** Нужен тестам: кадры сами по себе не протухают. */
export function clearEmojiBitmaps(): void {
  bitmaps.clear()
}

const SVG_NS = 'http://www.w3.org/2000/svg'

async function renderFirstFrame(
  animationData: EmojiAnimation,
  size: EmojiBitmapSize,
): Promise<string> {
  const lottie = await loadLottiePlayer()

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
