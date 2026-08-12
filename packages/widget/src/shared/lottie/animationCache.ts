import type { AnimationLoader, LottieCache } from './lottieCache'
import { createLottieCache } from './lottieCache'

let cache: LottieCache | null = null

/**
 * Кэш анимаций на всё приложение, а не на монтирование панели: иначе каждое закрытие пикера
 * выбрасывало бы уже скачанное, и повторное открытие качало бы всё заново. Лента и пикер берут
 * один и тот же кэш — эмодзи, выбранное в панели, в сообщении уже не качается.
 *
 * Загрузчик приходит параметром, чтобы модуль не тянул `chatController` — но фактически он
 * всегда один и тот же: `actions` собираются в конструкторе контроллера-синглтона и не
 * пересоздаются.
 */
export function getAnimationCache(load: AnimationLoader): LottieCache {
  cache ??= createLottieCache(load)
  return cache
}

/** Нужен тестам: кэш — модульный синглтон. */
export function resetAnimationCache(): void {
  cache = null
}
