import type { ImageTimelineItem } from '@/domain/timeline'
import { useChatActions } from '@/hooks/useChatActions'
import { t } from '@/i18n'
import { ProgressRing } from '@/shared/ui/ProgressRing'
import { Spinner } from '@/shared/ui/Spinner'
import { CloseIcon, DownloadIcon, ImageIcon, RetryIcon } from '@/shared/ui/icons'
import { assertNever } from '@/shared/utils/assertNever'
import { cn } from '@/shared/utils/cn'
import type { ReactNode } from 'react'
import styles from './ImageContent.module.css'
import { useFileObjectUrl } from '../../hooks/useFileObjectUrl'
import { useMediaDownload } from '../../hooks/useMediaDownload'
import { useMediaSource } from '../../hooks/useMediaSource'
import { getMediaState } from '../../utils/mediaState'
import { pickThumbnailSize } from '../../utils/thumbnailSize'

interface Props {
  item: ImageTimelineItem
}

export function ImageContent({ item }: Props) {
  const { cancelUpload, resendMessage } = useChatActions()
  const { download, isLoading } = useMediaDownload(item)
  const { url, filename, body } = item.content

  const source = useMediaSource({ mxcUrl: url, size: pickThumbnailSize() })
  const state = getMediaState(item, source.status === 'rejected')

  // Локальная копия закрывает только неизвестность — загрузку и карантин CDR (редьюсер снимает
  // upload сразу после заливки, а сервер до вердикта отвечает 504). Вердикт её снимает: при
  // «готово» есть замена, при «отбракован» файла в переписке нет и прятать это нельзя.
  const settled = source.status === 'ready' || source.status === 'rejected'
  const localUrl = useFileObjectUrl(item.upload?.file, settled)

  const serverUrl = source.status === 'ready' ? source.url : null
  const imageUrl = settled ? serverUrl : localUrl
  const alt = body || filename || t('chat.media.imageAlt')

  const renderAction = (): ReactNode => {
    switch (state.status) {
      case 'uploading':
        return (
          <button
            type="button"
            className={styles.cancel}
            aria-label={t('chat.action.cancelUpload')}
            onClick={() => cancelUpload(item.localId)}
          >
            <ProgressRing percent={state.pct} />
            <CloseIcon size={12} />
          </button>
        )
      // Сорвавшаяся заливка: действие в том же слоте по центру кадра, где до этого крутилось
      // кольцо прогресса. Подписи нет — на картинке ей негде поместиться, иконка говорит сама.
      case 'uploadFailed':
        return state.retryable ? (
          <button
            type="button"
            className={styles.action}
            aria-label={t('chat.action.retryUpload')}
            onClick={() => resendMessage(item.localId)}
          >
            <RetryIcon size={24} />
          </button>
        ) : (
          <button
            type="button"
            className={styles.action}
            aria-label={t('chat.action.removeFile')}
            onClick={() => cancelUpload(item.localId)}
          >
            <CloseIcon size={24} />
          </button>
        )
      // Скачивание — отдельная кнопка: сама картинка кликом ничего не делает.
      // Пока на кадре заглушка, кнопки нет: пользователь ещё не видит, что скачивает.
      case 'available':
        return imageUrl ? (
          <button
            type="button"
            className={styles.download}
            aria-label={t('chat.media.download', { name: filename })}
            onClick={download}
            disabled={isLoading}
          >
            {isLoading ? <Spinner size="icon" /> : <DownloadIcon size={16} />}
          </button>
        ) : null
      case 'rejected':
      case 'sendFailed':
        return null
      default:
        return assertNever(state)
    }
  }

  return (
    <div className={cn(styles.frame, state.status === 'uploadFailed' && styles.failed)}>
      {imageUrl ? (
        <img
          className={cn(styles.image, state.status === 'uploading' && styles.dimmed)}
          src={imageUrl}
          alt={alt}
        />
      ) : (
        <ImagePlaceholder source={source} />
      )}
      {renderAction()}
    </div>
  )
}

function ImagePlaceholder({ source }: { source: ReturnType<typeof useMediaSource> }) {
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
