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

export interface LottiePool {
  /** Ставит плеер в очередь на тик. Возвращает функцию снятия — звать в cleanup эффекта. */
  acquire: (player: PoolPlayer) => () => void
  readonly size: number
  readonly playing: number
}

interface Entry {
  player: PoolPlayer
  frame: number
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

  function tick(time: number): void {
    handle = null
    if (entries.size === 0) return

    const elapsed = lastTime === null ? FRAME_INTERVAL_MS : time - lastTime

    // Кадр ещё не «созрел» — пропускаем работу, но цикл продолжаем.
    if (elapsed >= FRAME_INTERVAL_MS) {
      lastTime = time

      let played = 0
      for (const entry of entries) {
        if (played >= MAX_PLAYING) break
        played++

        const { player } = entry
        if (player.totalFrames <= 0) continue

        // Считаем по времени, а не «+1 кадр»: при пропущенных кадрах анимация не замедляется.
        entry.frame = (entry.frame + (elapsed * player.frameRate) / 1000) % player.totalFrames
        player.goToAndStop(entry.frame, true)
      }
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
    acquire(player) {
      // Уважаем prefers-reduced-motion: показываем первый кадр — он информативнее силуэта, —
      // но цикл не заводим вовсе.
      if (prefersReducedMotion()) {
        player.goToAndStop(0, true)
        return () => {}
      }

      const entry: Entry = { player, frame: 0 }
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
