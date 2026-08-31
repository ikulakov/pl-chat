import type { AnimationLoader, LottieCache } from './lottieCache'
import { createLottieCache } from './lottieCache'

/**
 * Пространство имён кэша. Эмодзи адресуются codepoint'ом, стикеры — mediaId, и загрузчики у них
 * разные: без разделения id стикера ушёл бы в загрузчик эмодзи.
 */
export type AnimationNamespace = 'emoji' | 'sticker'

const caches = new Map<AnimationNamespace, LottieCache>()

/**
 * Кэш анимаций на всё приложение, а не на монтирование панели: иначе каждое закрытие пикера
 * выбрасывало бы уже скачанное, и повторное открытие качало бы всё заново. Лента и пикер берут
 * один и тот же кэш — эмодзи, выбранное в панели, в сообщении уже не качается.
 *
 * Загрузчик приходит параметром, чтобы модуль не тянул `chatController` — но фактически он
 * всегда один и тот же: `actions` собираются в конструкторе контроллера-синглтона и не
 * пересоздаются. Запоминается загрузчик первого вызова в своём пространстве имён.
 */
export function getAnimationCache(
  namespace: AnimationNamespace,
  load: AnimationLoader,
): LottieCache {
  const existing = caches.get(namespace)
  if (existing) return existing

  const cache = createLottieCache(load)
  caches.set(namespace, cache)

  return cache
}

/** Нужен тестам: кэши — модульные синглтоны. */
export function resetAnimationCache(): void {
  caches.clear()
}
