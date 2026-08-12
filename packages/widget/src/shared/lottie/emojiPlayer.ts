import { createCanvasAnimation } from './canvasAnimation'
import { loadLottie } from './lottieModule'
import type { LottieJson, SizedAnimation } from './types'

/**
 * Плеер поверх готового canvas. Кадры ему проставляет пул (`playInPool`), поэтому создаётся он
 * всегда с `autoplay: false` — своего цикла у плеера быть не должно.
 */
export async function createEmojiPlayer(
  canvas: HTMLCanvasElement,
  animationData: LottieJson,
): Promise<SizedAnimation | null> {
  const context = canvas.getContext('2d')
  if (!context) return null

  const lottie = await loadLottie()

  return createCanvasAnimation(lottie, canvas, context, animationData, true)
}
