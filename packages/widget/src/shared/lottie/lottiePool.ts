import type { AnimationItem } from 'lottie-web'

/**
 * Общий тик анимаций.
 *
 * Один `requestAnimationFrame` на весь виджет вместо цикла на каждое эмодзи: плееры создаются
 * с `autoplay: false`, кадры им проставляет пул. Отсюда же берутся потолок одновременно играющих
 * и уважение `prefers-reduced-motion`.
 */

// 30 кадров в секунду хватает эмодзи и вдвое дешевле, чем гнать анимацию на частоте экрана.
const FRAME_INTERVAL_MS = 1000 / 30

// Потолок одновременно играющих. Вытесненные не снимаются, а замирают на текущем кадре:
// в ленте крупных эмодзи заведомо немного, и приоритет у зарегистрированных раньше.
const MAX_PLAYING = 12

interface PoolEntry {
  player: AnimationItem
  startedAt: number
}

const entries = new Map<AnimationItem, PoolEntry>()
let rafId: number | null = null
let lastTickAt = 0

/**
 * Ставит плеер в пул и возвращает функцию снятия. Снимать обязательно в cleanup эффекта:
 * оставленный в пуле плеер — утечка, которую никто больше не подберёт.
 */
export function playInPool(player: AnimationItem): () => void {
  player.goToAndStop(0, true)

  // Уважение к настройке системы: показываем первый кадр и не тикаем вовсе.
  if (prefersReducedMotion()) return () => {}

  entries.set(player, { player, startedAt: now() })
  startTicking()

  return () => {
    entries.delete(player)
    if (entries.size === 0) stopTicking()
  }
}

/** Нужен тестам: пул — модульный синглтон, между кейсами его надо обнулять. */
export function resetPool(): void {
  entries.clear()
  stopTicking()
}

function tick(timestamp: number): void {
  rafId = requestAnimationFrame(tick)

  if (timestamp - lastTickAt < FRAME_INTERVAL_MS) return
  lastTickAt = timestamp

  let playing = 0
  for (const entry of entries.values()) {
    if (playing >= MAX_PLAYING) break
    advance(entry, timestamp)
    playing += 1
  }
}

function advance({ player, startedAt }: PoolEntry, timestamp: number): void {
  const { totalFrames, frameRate } = player
  if (!totalFrames || !frameRate) return

  const frame = (((timestamp - startedAt) / 1000) * frameRate) % totalFrames
  player.goToAndStop(frame, true)
}

function startTicking(): void {
  if (rafId !== null) return
  lastTickAt = 0
  rafId = requestAnimationFrame(tick)
}

function stopTicking(): void {
  if (rafId === null) return
  cancelAnimationFrame(rafId)
  rafId = null
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function now(): number {
  return typeof performance === 'object' ? performance.now() : Date.now()
}
