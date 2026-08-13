import type { AnimationItem, LottiePlayer } from 'lottie-web'
import type { EmojiAnimation } from '../../domain/emoji'

let playerPromise: Promise<LottiePlayer> | null = null

/**
 * Ленивая загрузка движка. lottie-web заметно тяжелее всего остального в бандле, а нужен он
 * только когда пользователь открыл пикер — статический импорт заставил бы платить за него
 * при каждой загрузке виджета.
 *
 * Сборка `lottie_light_canvas`: canvas-рендерер без выражений. SVG-рендерер на сетке из
 * десятков анимаций создаёт тысячи DOM-узлов, а выражения паку эмодзи не нужны.
 */
export function loadLottiePlayer(): Promise<LottiePlayer> {
  playerPromise ??= import('lottie-web/build/player/lottie_light_canvas')
    .then((module) => module.default)
    .catch((err: unknown) => {
      // Упавший импорт в кэше не держим — как и остальные кэши промисов в проекте. Иначе один
      // сетевой сбой (или деплой, поменявший хешированные имена ассетов посреди сессии)
      // навсегда отравил бы промис: до перезагрузки страницы все эмодзи остались бы глифами.
      playerPromise = null
      throw err
    })

  return playerPromise
}

export interface CreatePlayerParams {
  container: HTMLElement
  animationData: EmojiAnimation
}

export function createEmojiPlayer(
  lottie: LottiePlayer,
  { container, animationData }: CreatePlayerParams,
): AnimationItem {
  return lottie.loadAnimation({
    container,
    renderer: 'canvas',
    // Кадры проигрывает общий пул (`lottiePool`), а не сам плеер: иначе на каждую анимацию
    // заводился бы отдельный rAF-цикл.
    loop: false,
    autoplay: false,
    animationData,
  })
}
