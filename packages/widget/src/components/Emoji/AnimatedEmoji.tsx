import type { AnimationItem } from 'lottie-web'
import { useEffect, useRef, useState } from 'react'
import { useEmojiBitmap } from '../../hooks/useEmojiBitmap'
import { useChatActions } from '../../hooks/useChatActions'
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver'
import { createEmojiPlayer } from '../../shared/lottie/emojiPlayer'
import { playInPool } from '../../shared/lottie/lottiePool'
import { cn } from '../../shared/utils/cn'
import styles from './Emoji.module.css'

interface Props {
  char: string
  codepoint: string
  /** Сторона в CSS-пикселях. */
  size: number
}

// Выше двух ретина уже не различает, а площадь canvas растёт квадратично.
const MAX_DPR = 2

/**
 * Крупное эмодзи: анимация, пока элемент виден. Вне вьюпорта плеер снимается с пула и
 * уничтожается — за экраном крутить нечего, а инстанс стоит памяти.
 */
export function AnimatedEmoji({ char, codepoint, size }: Props) {
  const { loadEmojiAnimation } = useChatActions()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isVisible, setVisible] = useState(false)
  const [isPlaying, setPlaying] = useState(false)

  const bitmap = useEmojiBitmap(codepoint, size > 64 ? 128 : 64)

  useIntersectionObserver({
    triggerRef: wrapRef,
    callback: (entry) => setVisible(entry.isIntersecting),
  })

  useEffect(() => {
    if (!isVisible) return

    let cancelled = false
    let player: AnimationItem | null = null
    let removeFromPool: (() => void) | null = null

    loadEmojiAnimation(codepoint)
      .then((animation) => {
        if (cancelled || !canvasRef.current) return null
        return createEmojiPlayer(canvasRef.current, animation)
      })
      .then((created) => {
        if (!created) return
        // Пока грузился плеер, элемент мог уйти с экрана — тогда его сразу же и убираем.
        if (cancelled) {
          created.destroy()
          return
        }

        player = created
        removeFromPool = playInPool(created)
        setPlaying(true)
      })
      .catch(() => {
        // Анимации нет — остаётся первый кадр или символ шрифтом.
      })

    return () => {
      cancelled = true
      removeFromPool?.()
      player?.destroy()
      setPlaying(false)
    }
  }, [isVisible, codepoint, loadEmojiAnimation])

  const pixels = Math.round(size * Math.min(window.devicePixelRatio || 1, MAX_DPR))

  return (
    <span
      ref={wrapRef}
      className={styles.animated}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.8) }}
      role="img"
      aria-label={char}
    >
      <canvas
        ref={canvasRef}
        className={cn(styles.layer, !isPlaying && styles.hidden)}
        width={pixels}
        height={pixels}
      />

      {!isPlaying &&
        (bitmap ? (
          <img
            className={styles.layer}
            src={bitmap}
            alt=""
          />
        ) : (
          <span className={styles.layer}>{char}</span>
        ))}
    </span>
  )
}
