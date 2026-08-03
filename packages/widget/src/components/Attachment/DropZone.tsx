import { type DragEvent, type PropsWithChildren, useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { cn } from '../../shared/utils/cn'
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from '../../shared/utils/fileValidation'
import { formatSize } from '../../shared/utils/formatSize'
import { useAttachment } from './AttachmentContext'
import styles from './DropZone.module.css'

function hasFiles(e: DragEvent<HTMLElement>): boolean {
  return e.dataTransfer.types.includes('Files')
}

/**
 * Оборачивает область чата (лента + композер), детектит перетаскивание файла и рисует оверлей.
 * - перетаскивание в оверлей → загрузка;
 * - перетаскивание мимо оверлея, но внутри чата → отмена (файл «исчезает»)
 */
export function DropZone({ children }: PropsWithChildren) {
  const { pickFile } = useAttachment()

  const [dragActive, setDragActive] = useState(false)
  const [overZone, setOverZone] = useState(false)

  // Счётчик глубины: dragenter/dragleave стреляют на каждом дочернем узле; без счётчика
  // оверлей мерцал бы при движении курсора над лентой.
  const depth = useRef(0)

  // отключает стандартное поведение браузера - открытие файла в новой вкладке при перетаскивании в iframe
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  function reset() {
    depth.current = 0
    setDragActive(false)
    setOverZone(false)
  }

  const onDragEnter = (e: DragEvent<HTMLElement>) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth.current += 1
    setDragActive(true)
  }

  const onDragOver = (e: DragEvent<HTMLElement>) => {
    // preventDefault обязателен, иначе drop не сработает.
    if (hasFiles(e)) e.preventDefault()
  }

  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!hasFiles(e)) return
    depth.current -= 1
    if (depth.current <= 0) reset()
  }

  // Бросок по корню (лента вне оверлея) — отмена: гасим оверлей, файл не берём.
  const onDropOutside = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    reset()
  }

  // Бросок в оверлей — загрузка. stopPropagation, чтобы не сработала отмена корня.
  const onDropZone = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    reset()
    const file = e.dataTransfer.files?.[0]
    if (file) pickFile(file)
  }

  // Наведение непосредственно на оверлей (не просто где-то в чате) — подсвечиваем заливку.
  const onZoneDragEnter = (e: DragEvent<HTMLElement>) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    setOverZone(true)
  }

  const onZoneDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!hasFiles(e)) return
    setOverZone(false)
  }

  return (
    <div
      className={styles.root}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDropOutside}
    >
      {children}

      <div
        className={cn(
          styles.overlay,
          dragActive && styles.overlayActive,
          overZone && styles.overlayHover,
        )}
        onDragEnter={onZoneDragEnter}
        onDragLeave={onZoneDragLeave}
        onDrop={onDropZone}
        aria-hidden={!dragActive}
      >
        <svg
          className={styles.overlayBorder}
          aria-hidden="true"
        >
          <rect
            x="0.5"
            y="0.5"
            rx="15.5"
          />
        </svg>
        <div className={styles.title}>{t('composer.drop.title')}</div>
        <div className={styles.hint}>
          {t('composer.drop.formats', {
            size: formatSize(MAX_FILE_SIZE_BYTES),
            formats: ALLOWED_EXTENSIONS.join(', '),
          })}
        </div>
      </div>
    </div>
  )
}
