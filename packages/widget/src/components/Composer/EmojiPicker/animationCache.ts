import type { AnimationLoader, LottieCache } from '../../../shared/lottie/lottieCache'
import { createLottieCache } from '../../../shared/lottie/lottieCache'

let cache: LottieCache | null = null

/**
 * Кэш анимаций на всё приложение, а не на монтирование панели: иначе каждое закрытие пикера
 * выбрасывало бы уже скачанное, и повторное открытие качало бы всё заново.
 *
 * Загрузчик приходит параметром, чтобы модуль не тянул `chatController` — но фактически он
 * всегда один и тот же: `actions` собираются в конструкторе контроллера-синглтона и не
 * пересоздаются.
 */
export function getAnimationCache(load: AnimationLoader): LottieCache {
  cache ??= createLottieCache(load)
  return cache
}
