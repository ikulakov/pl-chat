import type { AnimationConfigWithData, LottiePlayer } from 'lottie-web'
import type { LottieJson, SizedAnimation } from './types'

/**
 * Плеер, рисующий в уже существующий canvas.
 *
 * `container` не передаётся сознательно: увидев его, lottie создаёт *свой* холст внутри
 * контейнера и игнорирует переданный контекст — на экране остаётся пустой прямоугольник.
 * Свой контекст он берёт только когда контейнера нет (`CanvasRendererBase.configAnimation`).
 * В типах контейнер помечен обязательным, отсюда приведение.
 *
 * `dpr: 1` — плотность мы считаем сами и уже заложили в размеры холста; иначе плеер домножит
 * их ещё раз и картинка уедет.
 */
export function createCanvasAnimation(
  lottie: LottiePlayer,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  animationData: LottieJson,
  loop: boolean,
): SizedAnimation {
  // Запоминаем до загрузки: плеер перепишет атрибуты холста под свой расчёт размера.
  const { width, height } = canvas

  const player = lottie.loadAnimation({
    renderer: 'canvas',
    loop,
    autoplay: false,
    animationData,
    rendererSettings: {
      context,
      clearCanvas: true,
      preserveAspectRatio: 'xMidYMid meet',
      dpr: 1,
    },
  } as unknown as AnimationConfigWithData<'canvas'>) as SizedAnimation

  // Размер задаём явно: без контейнера плеер вычисляет его из холста, а у холста вне документа
  // размер нулевой — кадр вышел бы прозрачным.
  player.resize(width, height)

  return player
}
