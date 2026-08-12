import { useEffect, useRef, useState } from 'react'
import { useChatActions } from '../../hooks/useChatActions'
import { useEmojiBitmap } from '../../hooks/useEmojiBitmap'
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver'
import { getAnimationCache } from '../../shared/lottie/animationCache'
import { createEmojiPlayer, loadLottiePlayer } from '../../shared/lottie/lottiePlayer'
import { lottiePool } from '../../shared/lottie/lottiePool'
import { cn } from '../../shared/utils/cn'
import styles from './Emoji.module.css'

interface Props {
  char: string
  codepoint: string
  version: string
  /** Сторона в CSS-пикселях. */
  size: number
}

/**
 * Крупное эмодзи: анимация, пока элемент виден. Вне вьюпорта плеер снимается с пула и
 * уничтожается — за экраном крутить нечего, а инстанс стоит памяти. Разжатая анимация при
 * этом остаётся в кэше, поэтому возврат в кадр сети не стоит.
 */
export function AnimatedEmoji({ char, codepoint, version, size }: Props) {
  const { loadEmojiAnimation } = useChatActions()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLSpanElement>(null)
  const [isVisible, setVisible] = useState(false)
  const [isPlaying, setPlaying] = useState(false)

  const bitmap = useEmojiBitmap(codepoint, version, size > 64 ? 128 : 64)

  useIntersectionObserver({
    triggerRef: wrapRef,
    callback: (entry) => setVisible(entry.isIntersecting),
  })

  useEffect(() => {
    if (!isVisible) return

    const cache = getAnimationCache(loadEmojiAnimation)
    let disposed = false
    let release: (() => void) | null = null
    let player: { destroy: () => void } | null = null

    void Promise.all([cache.get(codepoint, version), loadLottiePlayer()])
      .then(([animationData, lottie]) => {
        const container = containerRef.current
        if (disposed || !container) return

        const instance = createEmojiPlayer(lottie, { container, animationData })
        player = instance
        release = lottiePool.acquire(instance)
        setPlaying(true)
      })
      .catch(() => {
        // Анимации нет — остаётся первый кадр или символ шрифтом. Это рабочее состояние.
      })

    return () => {
      disposed = true
      release?.()
      player?.destroy()
      setPlaying(false)
    }
  }, [isVisible, codepoint, version, loadEmojiAnimation])

  return (
    <span
      ref={wrapRef}
      className={styles.animated}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.8) }}
      role="img"
      aria-label={char}
    >
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

      <span
        ref={containerRef}
        className={cn(styles.layer, styles.canvas)}
        aria-hidden
      />
    </span>
  )
}
