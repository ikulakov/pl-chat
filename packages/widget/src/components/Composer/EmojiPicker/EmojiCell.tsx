import { useEffect, useRef, useState } from 'react'
import type { EmojiItem } from '../../../domain/emoji'
import { useEmojiBitmap } from '../../../hooks/useEmojiBitmap'
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
 * Ячейка сетки: силуэт → статичный первый кадр → анимация под курсором.
 *
 * Постоянной анимации здесь намеренно нет. Раньше плеер заводился на каждую видимую ячейку, и
 * открытая панель — это несколько десятков анимаций, которые крутятся всё время, пока она
 * открыта: и CPU занят, и в глазах рябит. Оживает ровно одна ячейка — та, на которую навели
 * курсор или встали фокусом, как в Telegram Desktop.
 *
 * Плеер живёт ровно на время наведения: увели курсор — снимаем с пула и уничтожаем. Разжатый
 * JSON и отрисованный кадр остаются в кэшах, поэтому повторное наведение сети не стоит.
 */
export function EmojiCell({ item, version, cache, scrollRef, onSelect }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [active, setActive] = useState(false)
  const [animated, setAnimated] = useState(false)

  useIntersectionObserver({
    // root — контейнер прокрутки: с вьюпортом по умолчанию rootMargin ниже был бы бесполезен,
    // ячейки обрезает этот контейнер.
    root: scrollRef,
    triggerRef: buttonRef,
    callback: (entry) => setVisible(entry.isIntersecting),
    // Небольшой запас: кадр успевает приехать до того, как ячейка реально видна.
    rootMargin: '64px',
  })

  // Кадр грузим только для подошедших к вьюпорту ячеек, но не выбрасываем при уходе: это уже
  // просто картинка, и возврат ячейки в кадр ничего не стоит.
  const frame = useEmojiBitmap(item.codepoint, version, 64, visible)

  useEffect(() => {
    if (!active) return

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
        // Не приехала анимация — ячейка остаётся кадром или силуэтом. Это рабочее состояние, а
        // не сбой экрана: пикер должен оставаться пригодным для выбора и без картинок.
        console.error('[PLChat] emoji animation failed:', item.codepoint, err)
      })

    return () => {
      disposed = true
      release?.()
      player?.destroy()
      setAnimated(false)
    }
  }, [active, item.codepoint, version, cache])

  return (
    <button
      ref={buttonRef}
      type="button"
      className={styles.cell}
      // Имя кнопки — сам символ: он же уедет в текст. Не на <img>, иначе кнопка теряет
      // доступное имя в момент подмены картинки анимацией.
      //
      // `title` намеренно нет: нативная подсказка показала бы тот же символ системным шрифтом
      // на тёмной плашке — поверх картинки, которая и так видна.
      aria-label={item.char}
      onClick={() => onSelect(item.char)}
      // Фокус наравне с курсором: при обходе сетки с клавиатуры анимация должна вести себя
      // так же, как под мышью.
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      {!animated &&
        (frame ? (
          <img
            className={styles.frame}
            src={frame}
            alt=""
            draggable={false}
          />
        ) : (
          item.silhouette && (
            <Silhouette
              className={styles.silhouette}
              src={item.silhouette}
            />
          )
        ))}

      <span
        ref={canvasRef}
        className={styles.canvas}
        aria-hidden
      />
    </button>
  )
}
