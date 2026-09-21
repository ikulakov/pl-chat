import type { LottieAnimation } from '@/domain/emoji'
import { evictOldest } from '@/shared/utils/evictOldest'

// Разжатая анимация — это разобранный JSON на десятки килобайт. Потолок в записях, а не в
// байтах: позиции пака однородны (512×512, ≤64 КБ в сжатом виде), поэтому число записей и
// есть предсказуемая граница.
const MAX_CACHED_ANIMATIONS = 200

export type AnimationLoader = (id: string, version: string) => Promise<LottieAnimation>

export interface LottieCache {
  get: (id: string, version: string) => Promise<LottieAnimation>
  readonly size: number
  clear: () => void
}

/**
 * Кэш анимаций по id: codepoint у эмодзи, mediaId у стикера. Хранится промис, а не готовые
 * данные: он же и дедуп — одно и то же эмодзи в нескольких ячейках (и двойной эффект
 * StrictMode) делят один запрос.
 *
 * Постоянного слоя нет намеренно. Байты отдаются с `Cache-Control: immutable` на неделю,
 * то есть HTTP-кэш браузера уже работает как persistent-уровень, и IndexedDB его бы
 * дублировал. Здесь экономится только повторный разбор JSON в рамках сессии.
 */
export function createLottieCache(load: AnimationLoader): LottieCache {
  const entries = new Map<string, Promise<LottieAnimation>>()

  return {
    get(id, version) {
      // Версия в ключе: после переseed'а пака старая запись не должна пережить обновление.
      const key = `${id}@${version}`
      const cached = entries.get(key)
      if (cached) return cached

      const request = load(id, version).catch((err: unknown) => {
        // Упавший запрос в кэше не держим: следующий показ ячейки пробует заново.
        entries.delete(key)
        throw err
      })

      entries.set(key, request)
      evictOldest(entries, MAX_CACHED_ANIMATIONS)

      return request
    },

    get size() {
      return entries.size
    },

    clear() {
      entries.clear()
    },
  }
}
