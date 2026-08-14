import { useCallback, useEffect, useRef, useState } from 'react'
import { useChatActions } from '../../hooks/useChatActions'
import { useEmojiBitmap } from '../../hooks/useEmojiBitmap'
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver'
import { getAnimationCache } from '../../shared/lottie/animationCache'
import { createEmojiPlayer, loadLottiePlayer } from '../../shared/lottie/lottiePlayer'
import { lottiePool, type PoolPlayer } from '../../shared/lottie/lottiePool'
import { cn } from '../../shared/utils/cn'
import styles from './Emoji.module.css'

interface Props {
  char: string
  codepoint: string
  version: string
  /** Сторона в CSS-пикселях. */
  size: number
}

/** `idle` — плеера ещё нет, `playing` — идёт прогон, `done` — замерли на последнем кадре. */
type Phase = 'idle' | 'playing' | 'done'

/**
 * Крупное эмодзи: один прогон анимации при появлении, дальше — стоп на последнем кадре, повтор
 * по клику. Так это ведёт себя в Telegram: анимация привлекает внимание один раз, а не мельтешит
 * всё время, пока сообщение на экране.
 *
 * Плеер живёт, пока элемент виден: вне вьюпорта он снимается с пула и уничтожается — за экраном
 * крутить нечего, а инстанс стоит памяти. Разжатая анимация при этом остаётся в кэше, поэтому
 * возврат в кадр сети не стоит.
 */
export function AnimatedEmoji({ char, codepoint, version, size }: Props) {
  const { loadEmojiAnimation } = useChatActions()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLSpanElement>(null)
  const playerRef = useRef<PoolPlayer | null>(null)
  const releaseRef = useRef<(() => void) | null>(null)
  const [isVisible, setVisible] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')

  const bitmap = useEmojiBitmap(codepoint, version, size > 64 ? 128 : 64)

  useIntersectionObserver({
    triggerRef: wrapRef,
    callback: (entry) => setVisible(entry.isIntersecting),
  })

  useEffect(() => {
    if (!isVisible) return

    const cache = getAnimationCache('emoji', loadEmojiAnimation)
    let disposed = false
    let player: { destroy: () => void } | null = null

    void Promise.all([cache.get(codepoint, version), loadLottiePlayer()])
      .then(([animationData, lottie]) => {
        const container = containerRef.current
        if (disposed || !container) return

        const instance = createEmojiPlayer(lottie, { container, animationData })
        player = instance
        playerRef.current = instance

        // Фазу поднимаем до acquire: при `prefers-reduced-motion` пул зовёт `onComplete`
        // синхронно, и обратный порядок оставил бы состояние в `playing` навсегда.
        setPhase('playing')
        releaseRef.current = lottiePool.acquire(instance, {
          loop: false,
          onComplete: () => setPhase('done'),
        })
      })
      .catch(() => {
        // Анимации нет — остаётся первый кадр или символ шрифтом. Это рабочее состояние.
      })

    return () => {
      disposed = true
      releaseRef.current?.()
      releaseRef.current = null
      player?.destroy()
      playerRef.current = null
      setPhase('idle')
    }
  }, [isVisible, codepoint, version, loadEmojiAnimation])

  const replay = useCallback(() => {
    const player = playerRef.current
    if (!player || phase === 'playing') return

    setPhase('playing')
    releaseRef.current = lottiePool.acquire(player, {
      loop: false,
      onComplete: () => setPhase('done'),
    })
  }, [phase])

  return (
    // Остаётся картинкой (`role="img"`), а не кнопкой: повтор анимации — необязательное
    // украшение, а вот отдельный tab-стоп на каждое эмодзи в ленте мешал бы всерьёз. Тот же
    // выбор сделан в веб-клиентах Telegram.
    <span
      ref={wrapRef}
      className={styles.animated}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.8) }}
      role="img"
      aria-label={char}
      onClick={replay}
    >
      {phase === 'idle' &&
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
