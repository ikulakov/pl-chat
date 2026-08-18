import type { EmojiAnimation } from '../../domain/emoji'

/**
 * Склейка загрузок эмодзи в пачки.
 *
 * Сетка пикера просит десятки анимаций в один кадр, лента — по одной на каждое уникальное
 * эмодзи в истории. Байты при этом те же, дорого именно число round-trip'ов: на мобильной сети
 * 45 запросов — это 45 задержек, выстроенных в очередь за лимитом соединений.
 *
 * Живёт под `lottieCache`, но над транспортом: кэш мемоизирует разобранный JSON, IndexedDB
 * закрывает повторные сессии, а сюда доходят только настоящие промахи.
 */

/** Окно сбора заявок. Кадр: за него успевает отработать вся видимая часть сетки. */
const WINDOW_MS = 16

/**
 * Сколько codepoint'ов уходит одним запросом. Сервер разрешает 300, но 300 позиций в query —
 * это ~2,4 КБ URL, а инспектирующие прокси режут строку запроса. 100 даёт ~800 байт и
 * схлопывает видимый экран сетки в один запрос — ради чего всё и затевалось.
 */
const MAX_BATCH = 100

/**
 * После скольких подряд упавших пачек батч выключается до перезагрузки вкладки. Сервер без
 * маршрута (`404` на `/bundle`) не должен получать пачку на каждый кадр — один раз убедились,
 * дальше работаем поштучно.
 */
const MAX_FAILURES = 3

export interface BatchedLoaderDeps {
  loadBatch: (codepoints: string[], version: string) => Promise<Record<string, EmojiAnimation>>
  loadOne: (codepoint: string, version: string) => Promise<EmojiAnimation>
  /** Подменяется в тестах: иначе каждая проверка ждала бы реальные 16 мс. */
  schedule?: (flush: () => void) => void
}

interface Pending {
  resolve: (animation: EmojiAnimation) => void
  reject: (err: unknown) => void
}

export function createBatchedLoader(
  deps: BatchedLoaderDeps,
): (codepoint: string, version: string) => Promise<EmojiAnimation> {
  const schedule = deps.schedule ?? ((flush: () => void) => setTimeout(flush, WINDOW_MS))

  // Заявки текущего окна. Версия в ключе окна, а не заявки: пачка уходит одним `v`, и мешать
  // в ней разные версии нельзя.
  let waiting = new Map<string, Pending[]>()
  let waitingVersion = ''
  let scheduled = false
  let failures = 0

  function flush(): void {
    const batch = waiting
    const version = waitingVersion
    waiting = new Map()
    waitingVersion = ''
    scheduled = false

    const codepoints = [...batch.keys()]
    if (codepoints.length === 0) return

    void deps
      .loadBatch(codepoints, version)
      .then((animations) => {
        failures = 0

        for (const [codepoint, listeners] of batch) {
          const animation = animations[codepoint]
          if (animation) {
            listeners.forEach((listener) => listener.resolve(animation))
            continue
          }
          // Сервер молча выбрасывает неизвестные позиции. Переспрашиваем поштучно: там
          // отсутствие эмодзи — честный 404, и он должен дойти до вызывающего.
          settleOne(codepoint, version, listeners)
        }
      })
      .catch((err: unknown) => {
        failures++
        if (failures >= MAX_FAILURES) {
          console.error('[PLChat] emoji bundle disabled after failures:', err)
        }
        // Пачка не приехала — это ещё не значит, что не приедут позиции: старый сервер без
        // маршрута отвечает 404 на весь `/bundle`, а не на эмодзи.
        for (const [codepoint, listeners] of batch) settleOne(codepoint, version, listeners)
      })
  }

  function settleOne(codepoint: string, version: string, listeners: Pending[]): void {
    void deps.loadOne(codepoint, version).then(
      (animation) => listeners.forEach((listener) => listener.resolve(animation)),
      (err: unknown) => listeners.forEach((listener) => listener.reject(err)),
    )
  }

  return function load(codepoint, version) {
    if (failures >= MAX_FAILURES) return deps.loadOne(codepoint, version)

    // Смена версии пака посреди окна: отправляем набранное сразу, не подмешивая чужой `v`.
    if (waiting.size > 0 && waitingVersion !== version) flush()

    return new Promise<EmojiAnimation>((resolve, reject) => {
      waitingVersion = version

      const listeners = waiting.get(codepoint)
      if (listeners) {
        listeners.push({ resolve, reject })
      } else {
        waiting.set(codepoint, [{ resolve, reject }])
      }

      // Набралась полная пачка — не ждём окно: следующие заявки поедут своей.
      if (waiting.size >= MAX_BATCH) {
        flush()
        return
      }

      if (!scheduled) {
        scheduled = true
        schedule(flush)
      }
    })
  }
}
