import { useEffect, useState } from 'react'
import { getEmojiBitmap } from '../shared/lottie/emojiBitmap'
import type { EmojiBitmapSize } from '../shared/lottie/types'
import { useChatActions } from './useChatActions'

/**
 * Первый кадр эмодзи картинкой. `null`, пока кадра нет — вызывающий рисует символ шрифтом,
 * чтобы строка не прыгала.
 */
export function useEmojiBitmap(codepoint: string, size: EmojiBitmapSize): string | null {
  const { loadEmojiAnimation } = useChatActions()
  // Ключ хранится вместе с картинкой: так смена эмодзи обнуляет кадр прямо в рендере, без
  // лишнего прохода через setState в эффекте.
  const [frame, setFrame] = useState<{ key: string; src: string } | null>(null)
  const key = `${codepoint}@${size}`

  useEffect(() => {
    let cancelled = false

    getEmojiBitmap(codepoint, size, loadEmojiAnimation)
      .then((src) => {
        if (!cancelled) setFrame({ key: `${codepoint}@${size}`, src })
      })
      .catch(() => {
        // Не нарисовали — остаётся символ системным шрифтом. Ошибка на каждое эмодзи в ленте
        // засорила бы консоль, а пользователю тут показывать нечего.
      })

    return () => {
      cancelled = true
    }
  }, [codepoint, size, loadEmojiAnimation])

  return frame?.key === key ? frame.src : null
}
