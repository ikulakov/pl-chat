// Сетка пикера — это десятки анимаций одновременно, и наивная реализация (свой цикл на
// каждый плеер) кладёт вкладку. Здесь один rAF на всё приложение, троттлинг по частоте и
// потолок одновременно играющих.

// Эмодзи 24×24: разница между 60 и 30 fps на таком размере не видна, а работы вдвое меньше.
const TARGET_FPS = 30
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS

// Во вьюпорт помещается ~45 ячеек. Играют не все: глазу хватает верхних, а остальные ждут
// своей очереди на паузе — так стоимость кадра не растёт вместе с высотой панели.
const MAX_PLAYING = 24

/**
 * Минимум от `AnimationItem` из lottie-web. Узкий интерфейс вместо самого типа: пул не
 * должен зависеть от библиотеки, а тесты — поднимать canvas.
 */
export interface PoolPlayer {
  readonly totalFrames: number
  readonly frameRate: number
  goToAndStop: (value: number, isFrame?: boolean) => void
}

export interface LottiePoolDeps {
  requestFrame?: (callback: (time: number) => void) => number
  cancelFrame?: (handle: number) => void
  prefersReducedMotion?: () => boolean
}

export interface AcquireOptions {
  /** `false` — проиграть один раз и замереть на последнем кадре. По умолчанию цикл. */
  loop?: boolean
  /** Зовётся, когда одиночный прогон дошёл до конца; запись к этому моменту уже снята с пула. */
  onComplete?: () => void
}

export interface LottiePool {
  /** Ставит плеер в очередь на тик. Возвращает функцию снятия — звать в cleanup эффекта. */
  acquire: (player: PoolPlayer, options?: AcquireOptions) => () => void
  readonly size: number
  readonly playing: number
}

interface Entry {
  player: PoolPlayer
  frame: number
  /** Когда запись играла в прошлый раз: при ротации она пропускает часть тиков. */
  lastPlayedAt: number | null
  loop: boolean
  onComplete: (() => void) | undefined
}

function defaultPrefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function createLottiePool(deps: LottiePoolDeps = {}): LottiePool {
  const requestFrame = deps.requestFrame ?? requestAnimationFrame
  const cancelFrame = deps.cancelFrame ?? cancelAnimationFrame
  const prefersReducedMotion = deps.prefersReducedMotion ?? defaultPrefersReducedMotion

  const entries = new Set<Entry>()
  let handle: number | null = null
  let lastTime: number | null = null
  // С какой позиции начинается обход на этом кадре. Без неё потолок всегда доставался бы
  // одним и тем же первым записям Set'а (он обходится в порядке вставки), и всё, что добавлено
  // после них, стояло бы на кадре 0 вечно — а не «ждало своей очереди».
  let rotationStart = 0

  function tick(time: number): void {
    handle = null
    if (entries.size === 0) return

    const elapsed = lastTime === null ? FRAME_INTERVAL_MS : time - lastTime

    // Кадр ещё не «созрел» — пропускаем работу, но цикл продолжаем.
    if (elapsed >= FRAME_INTERVAL_MS) {
      lastTime = time

      const ordered = [...entries]
      const size = ordered.length
      let played = 0

      for (let i = 0; i < size && played < MAX_PLAYING; i++) {
        const entry = ordered[(rotationStart + i) % size]
        if (!entry) continue

        const { player } = entry
        // Вырожденную анимацию пропускаем до счётчика — иначе она занимала бы слот впустую.
        if (player.totalFrames <= 0) continue
        played++

        // Считаем от момента, когда эта запись игралась в прошлый раз, а не от общего кадра:
        // при ротации запись пропускает часть тиков, и общий elapsed замедлял бы её.
        const since = entry.lastPlayedAt === null ? elapsed : time - entry.lastPlayedAt
        entry.lastPlayedAt = time

        const advanced = entry.frame + (since * player.frameRate) / 1000

        // Одиночный прогон: доехали до конца — замираем на последнем кадре и снимаем запись
        // сами. Ждать cleanup эффекта нельзя, он наступит только когда эмодзи уедет с экрана,
        // а до тех пор пул продолжал бы тикать по завершённой анимации.
        if (!entry.loop && advanced >= player.totalFrames - 1) {
          player.goToAndStop(player.totalFrames - 1, true)
          entries.delete(entry)
          entry.onComplete?.()
          continue
        }

        entry.frame = advanced % player.totalFrames
        player.goToAndStop(entry.frame, true)
      }

      rotationStart = size > 0 ? (rotationStart + played) % size : 0
    }

    handle = requestFrame(tick)
  }

  function start(): void {
    if (handle !== null) return
    lastTime = null
    handle = requestFrame(tick)
  }

  function stop(): void {
    if (handle === null) return
    cancelFrame(handle)
    handle = null
  }

  return {
    acquire(player, options = {}) {
      // Уважаем prefers-reduced-motion: показываем первый кадр — он информативнее силуэта, —
      // но цикл не заводим вовсе.
      if (prefersReducedMotion()) {
        player.goToAndStop(0, true)
        // Прогон считается состоявшимся: вызывающий снимает состояние «играет» и показывает
        // повтор, иначе кнопка повтора осталась бы навсегда неактивной.
        options.onComplete?.()
        return () => {}
      }

      const entry: Entry = {
        player,
        frame: 0,
        lastPlayedAt: null,
        loop: options.loop ?? true,
        onComplete: options.onComplete,
      }
      entries.add(entry)
      start()

      return () => {
        entries.delete(entry)
        if (entries.size === 0) stop()
      }
    },

    get size() {
      return entries.size
    },

    get playing() {
      return Math.min(entries.size, MAX_PLAYING)
    },
  }
}

/** Общий пул на всё приложение — единственный rAF-цикл, как того требует контракт. */
export const lottiePool = createLottiePool()
