import { useEffect, useRef, useState } from 'react'
import type { EmojiItem } from '../../../domain/emoji'
import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver'
import type { LottieCache } from '../../../shared/lottie/lottieCache'
import { createEmojiPlayer, loadLottiePlayer } from '../../../shared/lottie/lottiePlayer'
import { lottiePool } from '../../../shared/lottie/lottiePool'
import { Silhouette } from '../../Silhouette/Silhouette'
import styles from './EmojiPicker.module.css'

interface Props {
  item: EmojiItem
  version: string
  cache: LottieCache
  /** Скроллящийся контейнер панели — он же root наблюдателя, см. PickerPanel. */
  scrollRef: React.RefObject<HTMLDivElement | null>
  onSelect: (char: string) => void
}

/**
 * Ячейка сетки: силуэт сразу, анимация — только пока ячейка видна.
 *
 * Плеер живёт ровно на время видимости. Уехала за экран — снимаем с пула и уничтожаем:
 * canvas и разобранная анимация на 580 позиций иначе съедят память, а тикать невидимое
 * бессмысленно. Разжатый JSON при этом остаётся в кэше, поэтому возврат ячейки в кадр
 * сети не стоит.
 */
export function EmojiCell({ item, version, cache, scrollRef, onSelect }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [animated, setAnimated] = useState(false)

  useIntersectionObserver({
    // root — контейнер прокрутки: с вьюпортом по умолчанию rootMargin ниже был бы бесполезен,
    // ячейки обрезает этот контейнер.
    root: scrollRef,
    triggerRef: buttonRef,
    callback: (entry) => setVisible(entry.isIntersecting),
    // Небольшой запас: анимация успевает приехать до того, как ячейка реально видна.
    rootMargin: '64px',
  })

  useEffect(() => {
    if (!visible) return

    let disposed = false
    let release: (() => void) | null = null
    let player: { destroy: () => void } | null = null

    void Promise.all([cache.get(item.codepoint, version), loadLottiePlayer()])
      .then(([animationData, lottie]) => {
        const container = canvasRef.current
        if (disposed || !container) return

        const instance = createEmojiPlayer(lottie, { container, animationData })
        player = instance
        release = lottiePool.acquire(instance)
        setAnimated(true)
      })
      .catch((err: unknown) => {
        // Не приехала анимация — ячейка остаётся силуэтом. Это рабочее состояние, а не сбой
        // экрана: пикер должен оставаться пригодным для выбора и без картинок.
        console.error('[PLChat] emoji animation failed:', item.codepoint, err)
      })

    return () => {
      disposed = true
      release?.()
      player?.destroy()
      setAnimated(false)
    }
  }, [visible, item.codepoint, version, cache])

  return (
    <button
      ref={buttonRef}
      type="button"
      className={styles.cell}
      // Имя кнопки — сам символ: он же уедет в текст. Не на <img>, иначе кнопка теряет
      // доступное имя в момент подмены силуэта анимацией.
      //
      // `title` намеренно нет: нативная подсказка показала бы тот же символ системным шрифтом
      // на тёмной плашке — поверх картинки, которая и так видна.
      aria-label={item.char}
      onClick={() => onSelect(item.char)}
    >
      {item.silhouette && !animated && (
        <Silhouette
          className={styles.silhouette}
          src={item.silhouette}
        />
      )}
      <span
        ref={canvasRef}
        className={styles.canvas}
        aria-hidden
      />
    </button>
  )
}
