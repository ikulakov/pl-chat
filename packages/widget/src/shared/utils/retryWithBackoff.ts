import { sleep } from './sleep'

export interface RetryWithBackoffOptions {
  /** Рвёт паузу между попытками и прекращает повторы; опрашивается после каждого await. */
  signal: AbortSignal
  baseMs: number
  maxMs: number
  /** Зовётся на каждую ошибку до паузы; `true` — ошибка терминальная, повторов не будет. */
  onError?: (err: unknown, backoff: number) => boolean
  /** Длительность паузы (джиттер, подсказка сервера); по умолчанию — сам backoff. */
  delay?: (err: unknown, backoff: number) => number
}

/**
 * Повторяет `attempt`, пока тот не выполнится: пауза растёт вдвое до `maxMs`, число попыток
 * не ограничено. `null` — повторы прекращены (остановка или терминальная ошибка); что делать
 * дальше, вызывающий уже решил в `onError`.
 *
 * Backoff живёт одну серию: следующий вызов начинает с `baseMs`, так что сброс после успеха
 * получается сам.
 *
 * Между `return` и продолжением вызывающего есть ещё микротаска: перед записью состояния
 * вызывающий сам перепроверяет `signal`.
 */
export async function retryWithBackoff<T>(
  attempt: () => Promise<T>,
  options: RetryWithBackoffOptions,
): Promise<T | null> {
  const { signal, baseMs, maxMs, onError, delay } = options

  let backoff = baseMs

  while (!signal.aborted) {
    try {
      const value = await attempt()

      // Ответ мог приехать уже после отмены: попытка его не бросила, но он устарел.
      return signal.aborted ? null : value
    } catch (err) {
      if (signal.aborted) return null

      // onError может и сам остановить владельца (recovery по auth-ошибке) — проверяем после.
      if (onError?.(err, backoff) || signal.aborted) return null

      await sleep(delay ? delay(err, backoff) : backoff, signal)
      backoff = Math.min(backoff * 2, maxMs)
    }
  }

  return null
}
