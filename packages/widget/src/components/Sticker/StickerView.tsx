import { useEffect, useRef, useState } from 'react'
import type { StickerFormat } from '../../domain/emoji'
import { useChatActions } from '../../hooks/useChatActions'
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver'
import { Endpoints } from '../../matrix/api/endpoints'
import { getAnimationCache } from '../../shared/lottie/animationCache'
import { createEmojiPlayer, loadLottiePlayer } from '../../shared/lottie/lottiePlayer'
import { lottiePool } from '../../shared/lottie/lottiePool'
import { cn } from '../../shared/utils/cn'
import styles from './Sticker.module.css'

export interface StickerViewData {
  mediaId: string
  /** Эмодзи-подпись: она же доступное имя. */
  body: string
  format: StickerFormat
  /** data:-URL силуэта; null — сервер его не прислал. */
  silhouette?: string | null
}

interface Props {
  sticker: StickerViewData
  /** Сторона в CSS-пикселях. */
  size: number
  /** Контейнер прокрутки — root наблюдателя. Без него rootMargin бесполезен внутри пикера. */
  root?: React.RefObject<Element | null>
}

/**
 * Показ стикера во всех трёх рендициях каталога. Ветвление — только по формату, выведенному
 * из `info.mimetype`: расширения в адресе байтов нет.
 *
 * Один компонент на ленту и на сетку пикера намеренно: три ветки рендера легко разъезжаются,
 * если держать их в двух местах.
 */
export function StickerView({ sticker, size, root }: Props) {
  const src = Endpoints.STICKER_BYTES({ mediaId: sticker.mediaId })

  return (
    <span
      className={styles.sticker}
      style={{ width: size, height: size }}
      role="img"
      aria-label={sticker.body}
    >
      {sticker.format === 'lottie' ? (
        <LottieSticker
          sticker={sticker}
          {...(root ? { root } : {})}
        />
      ) : sticker.format === 'video' ? (
        <VideoSticker
          src={src}
          silhouette={sticker.silhouette ?? null}
          {...(root ? { root } : {})}
        />
      ) : (
        <img
          className={styles.layer}
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
        />
      )}
    </span>
  )
}

/**
 * Lottie: тот же путь, что у эмодзи — общий пул кадров и общий плеер. Кэш берём в своём
 * пространстве имён: стикеры адресуются mediaId, а не codepoint'ом, и загрузчик у них свой.
 */
function LottieSticker({
  sticker,
  root,
}: {
  sticker: StickerViewData
  root?: React.RefObject<Element | null>
}) {
  const { loadStickerAnimation } = useChatActions()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLSpanElement>(null)
  const [isVisible, setVisible] = useState(false)
  const [isPlaying, setPlaying] = useState(false)

  useIntersectionObserver({
    triggerRef: wrapRef,
    callback: (entry) => setVisible(entry.isIntersecting),
    ...(root ? { root } : {}),
    rootMargin: '64px',
  })

  useEffect(() => {
    if (!isVisible) return

    const cache = getAnimationCache('sticker', loadStickerAnimation)
    let disposed = false
    let release: (() => void) | null = null
    let player: { destroy: () => void } | null = null

    // Версии у стикеров нет: пак не отдаёт её по HTTP, а mediaId меняется при перезаливке.
    void Promise.all([cache.get(sticker.mediaId, ''), loadLottiePlayer()])
      .then(([animationData, lottie]) => {
        const container = containerRef.current
        if (disposed || !container) return

        const instance = createEmojiPlayer(lottie, { container, animationData })
        player = instance
        release = lottiePool.acquire(instance)
        setPlaying(true)
      })
      .catch(() => {
        // Анимация не приехала — остаётся силуэт. Рабочее состояние, не ошибка экрана.
      })

    return () => {
      disposed = true
      release?.()
      player?.destroy()
      setPlaying(false)
    }
  }, [isVisible, sticker.mediaId, loadStickerAnimation])

  return (
    <span
      ref={wrapRef}
      className={styles.layer}
    >
      {!isPlaying && <Silhouette src={sticker.silhouette ?? null} />}
      <span
        ref={containerRef}
        className={cn(styles.layer, styles.canvas)}
        aria-hidden
      />
    </span>
  )
}

/**
 * Видео: VP9 с альфой. `muted` и `playsInline` обязательны — без них iOS не запускает
 * автовоспроизведение. Играем только пока видно: пул кадров сюда не распространяется, декодирует
 * браузер, и двадцать одновременных декодеров — это отдельный бюджет.
 *
 * Safari не поддерживает альфу в VP9, поэтому там фон стикера будет чёрным. Надёжного способа
 * распознать именно поддержку альфы нет, а подмена на серый силуэт хуже самого дефекта.
 */
function VideoSticker({
  src,
  silhouette,
  root,
}: {
  src: string
  silhouette: string | null
  root?: React.RefObject<Element | null>
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isReady, setReady] = useState(false)

  useIntersectionObserver({
    triggerRef: videoRef,
    callback: (entry) => {
      const video = videoRef.current
      if (!video) return

      if (entry.isIntersecting) void video.play().catch(() => {})
      else video.pause()
    },
    ...(root ? { root } : {}),
    rootMargin: '64px',
  })

  return (
    <>
      {!isReady && <Silhouette src={silhouette} />}
      <video
        ref={videoRef}
        className={styles.layer}
        src={src}
        loop
        muted
        playsInline
        preload="metadata"
        onCanPlay={() => setReady(true)}
      />
    </>
  )
}

function Silhouette({ src }: { src: string | null }) {
  if (!src) return null

  return (
    <img
      className={styles.layer}
      src={src}
      alt=""
      draggable={false}
    />
  )
}
