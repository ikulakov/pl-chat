import type { LottiePlayer } from 'lottie-web'

/**
 * Ленивая загрузка плеера.
 *
 * `lottie_light_canvas` — самая узкая сборка (canvas-рендерер без выражений), но и она весит
 * ~450 КБ исходника. Виджет встраивается в чужие страницы, поэтому в стартовый бандл она не
 * идёт: чанк подтягивается при первом эмодзи, которое надо нарисовать, и дальше живёт в кэше
 * модулей. Всё равно рисовать нечего, пока не приехали байты анимации.
 */

let player: Promise<LottiePlayer> | null = null

export function loadLottie(): Promise<LottiePlayer> {
  player ??= import('lottie-web/build/player/lottie_light_canvas').then((module) => module.default)
  return player
}
