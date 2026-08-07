import { useEffect, useState } from 'react'
import type { ImageTimelineItem } from '../../../domain/timeline'
import { isRetryableFailure, type UploadFailure } from '../../../domain/uploadError'
import { useMediaSource } from './useMediaSource'
import { t } from '../../../i18n'
import { pickThumbnailSize } from './thumbnailSize'
import { ProgressRing } from '../../../shared/ui/ProgressRing'
import { Spinner } from '../../../shared/ui/Spinner'
import { CloseIcon, DownloadIcon, ImageIcon, RetryIcon } from '../../../shared/ui/icons'
import { cn } from '../../../shared/utils/cn'
import styles from './MediaImage.module.css'

interface Props {
  item: ImageTimelineItem
  // проценты идущей заливки; null — байты не льются
  pct: number | null
  busy: boolean
  // причина сорвавшейся заливки; undefined — заливка не падала
  failure?: UploadFailure | undefined
  onDownload: () => void
  onCancel: () => void
  onRetry: () => void
}

export function MediaImage({ item, pct, busy, failure, onDownload, onCancel, onRetry }: Props) {
  const { url, filename, body } = item.content

  const isUploading = pct !== null

  const source = useMediaSource({ mxcUrl: url, size: pickThumbnailSize() })

  // Локальная копия закрывает только неизвестность — загрузку и карантин CDR (редьюсер снимает
  // upload сразу после заливки, а сервер до вердикта отвечает 504). Вердикт её снимает: при
  // «готово» есть замена, при «отбракован» файла в переписке нет и прятать это нельзя.
  const settled = source.status === 'ready' || source.status === 'rejected'
  const localUrl = useFileObjectUrl(item.upload?.file, settled)

  const serverUrl = source.status === 'ready' ? source.url : null
  const imageUrl = settled ? serverUrl : localUrl
  const alt = body || filename || t('chat.media.imageAlt')

  return (
    <div className={cn(styles.frame, failure !== undefined && styles.failed)}>
      {imageUrl ? (
        <img
          className={cn(styles.image, isUploading && styles.dimmed)}
          src={imageUrl}
          alt={alt}
        />
      ) : (
        <MediaPlaceholder source={source} />
      )}

      {pct !== null && (
        <button
          type="button"
          className={styles.cancel}
          aria-label={t('chat.action.cancelUpload')}
          onClick={onCancel}
        >
          <ProgressRing percent={pct} />
          <CloseIcon size={12} />
        </button>
      )}

      {/* Сорвавшаяся заливка: действие живёт в том же слоте по центру кадра, где до этого
          крутилось кольцо прогресса. Подписи нет — на картинке ей негде поместиться,
          а иконка (повтор/крестик) сама говорит, что делать. */}
      {failure !== undefined && (
        <button
          type="button"
          className={styles.action}
          aria-label={
            isRetryableFailure(failure) ? t('chat.action.retryUpload') : t('chat.action.removeFile')
          }
          onClick={isRetryableFailure(failure) ? onRetry : onCancel}
        >
          {isRetryableFailure(failure) ? <RetryIcon size={24} /> : <CloseIcon size={24} />}
        </button>
      )}

      {/* Скачивание — отдельная кнопка: сама картинка кликом ничего не делает.
          При сорвавшейся заливке её нет: на сервере файла ещё не существует, а у пользователя
          он и так на диске — центральный слот занят повтором либо удалением. */}
      {imageUrl && !isUploading && item.sendStatus !== 'failed' && (
        <button
          type="button"
          className={styles.download}
          aria-label={t('chat.media.download', { name: filename })}
          onClick={onDownload}
          disabled={busy}
        >
          {busy ? <Spinner size="icon" /> : <DownloadIcon size={16} />}
        </button>
      )}
    </div>
  )
}

function MediaPlaceholder({ source }: { source: ReturnType<typeof useMediaSource> }) {
  if (source.status === 'error') {
    return (
      <button
        type="button"
        className={styles.placeholder}
        onClick={source.retry}
      >
        <ImageIcon size={24} />
        <span className={styles.hint}>{t('chat.media.error')}</span>
      </button>
    )
  }

  const hint =
    source.status === 'checking'
      ? t('chat.media.checking')
      : source.status === 'rejected'
        ? t('chat.media.rejected')
        : null

  return (
    <span className={cn(styles.placeholder, !hint && styles.skeleton)}>
      {hint ? (
        <>
          <ImageIcon size={24} />
          <span className={styles.hint}>{hint}</span>
        </>
      ) : null}
    </span>
  )
}

/**
 * Локальное превью своего файла. Живёт дольше, чем сам `File` в сообщении: `settled`
 * говорит, что сервер вынес вердикт и байты можно отпустить. Пока вердикта нет, URL
 * держим — иначе картинка на секунды сменяется пустым фоном.
 *
 * Создаём именно в эффекте, а не в useMemo: мемо не гарантирует однократного выполнения —
 * StrictMode прогоняет рендер дважды, а прерванный конкурентный рендер вообще не коммитится,
 * и созданный в нём URL не увидит ни один cleanup (утечка байтов файла на весь сеанс).
 */
function useFileObjectUrl(file: File | undefined, settled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null)

  // Сообщение теряет File сразу после заливки (message.uploaded), а превью нужно дольше —
  // до прихода серверной версии. Поэтому файл запоминаем и не отпускаем вместе с сообщением.
  const [held, setHeld] = useState(file)
  if (file && file !== held) setHeld(file)

  useEffect(() => {
    if (!held || settled) return

    const objectUrl = URL.createObjectURL(held)
    // set-state-in-effect: правило про синхронизацию с внешним стейтом, а здесь эффект
    // СОЗДАЁТ ресурс — узнать URL до коммита неоткуда. Цена — лишний рендер на монтирование;
    // альтернатива (useMemo) течёт байтами файла на прерванном рендере.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl)

    // Освобождаем по вердикту сервера и на размонтировании ряда. Потеря File самим
    // сообщением сюда не относится — на неё эффект не перезапускается, URL живёт дальше.
    return () => {
      URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [held, settled])

  return url
}
