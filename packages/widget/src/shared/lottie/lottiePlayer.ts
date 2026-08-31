import type { AnimationItem, LottiePlayer } from 'lottie-web'
import type { EmojiAnimation } from '../../domain/emoji'

let playerPromise: Promise<LottiePlayer> | null = null

/**
 * Ленивая загрузка движка. lottie-web заметно тяжелее всего остального в бандле, а нужен он
 * только когда пользователь открыл пикер — статический импорт заставил бы платить за него
 * при каждой загрузке виджета.
 *
 * Сборка `lottie_light`: SVG-рендерер без выражений. Canvas был бы дешевле по узлам, но его
 * рендерер в lottie-web **не умеет track matte** — а пак эмодзи держит на маттах блики: сердца
 * выходили «обрубленными», со срезанной по прямой верхушкой. Проверено на 5.13.0, дефект
 * одинаков и в `lottie_canvas`, и в `lottie_light_canvas`. По времени кадра SVG при этом не
 * хуже (60 анимаций 24×24: ~26 мс против ~31 мс на полный обход), платим только узлами DOM.
 */
export function loadLottiePlayer(): Promise<LottiePlayer> {
  playerPromise ??= import('lottie-web/build/player/lottie_light')
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
    renderer: 'svg',
    // Кадры проигрывает общий пул (`lottiePool`), а не сам плеер: иначе на каждую анимацию
    // заводился бы отдельный rAF-цикл.
    loop: false,
    autoplay: false,
    animationData,
  })
}
