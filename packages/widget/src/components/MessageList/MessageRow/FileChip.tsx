import type { FileTimelineItem } from '../../../domain/timeline'
import { isRetryableFailure, type UploadFailure } from '../../../domain/uploadError'
import { useChatActions } from '../../../hooks/useChatActions'
import { useMediaDownload } from '../../../hooks/useMediaDownload'
import { t } from '../../../i18n'
import { ProgressRing } from '../../../shared/ui/ProgressRing'
import { Spinner } from '../../../shared/ui/Spinner'
import { CloseIcon, DownloadIcon, FileDocIcon, RetryIcon } from '../../../shared/ui/icons'
import { cn } from '../../../shared/utils/cn'
import { getFileExtension } from '../../../shared/utils/fileValidation'
import { formatSize } from '../../../shared/utils/formatSize'
import { BubbleMeta, type BubbleMetaData } from './BubbleMeta'
import styles from './FileChip.module.css'
import { MediaCaption } from './MediaCaption'
import { useMediaUploadView } from './useMediaUploadView'

interface Props {
  item: FileTimelineItem
  meta: BubbleMetaData
}

export function FileChip({ item, meta }: Props) {
  const { cancelUpload, resendMessage } = useChatActions()
  const { download, isLoading } = useMediaDownload(item)
  const { uploadPct, failure, uploadFailed, isStatusHidden } = useMediaUploadView(item)
  const isUploading = uploadPct !== null

  const { body, filename, info } = item.content

  const hasCaption = body.length > 0

  const extension = getFileExtension(filename).toUpperCase()
  const fileHint = extension || formatSize(info.size)

  // Причину не разворачиваем: пользователю она ничего не меняет — что делать, говорит само
  // действие рядом (повтор либо «убрать»). Различает случаи только текст aria-label кнопки.
  const subline = uploadFailed
    ? t('chat.upload.error')
    : isUploading
      ? t('composer.upload.progress', { percent: uploadPct })
      : fileHint

  const chipBody = (
    <span className={styles.info}>
      <span className={styles.filename}>{filename}</span>
      <span className={styles.subline}>
        <span
          className={cn(styles.size, isUploading && styles.progress, uploadFailed && styles.failed)}
        >
          {subline}
        </span>
        {!hasCaption && (
          <BubbleMeta
            {...meta}
            inline
            isStatusHidden={isStatusHidden}
          />
        )}
      </span>
    </span>
  )

  return (
    <div className={styles.wrap}>
      {isUploading ? (
        // Во время заливки чип не кликабелен целиком: внутри уже есть кнопка отмены,
        // а вложенные <button> невалидны.
        <div className={styles.chip}>
          <button
            type="button"
            className={styles.cancelBox}
            aria-label={t('chat.action.cancelUpload')}
            onClick={() => cancelUpload(item.localId)}
          >
            <ProgressRing percent={uploadPct} />
            <CloseIcon size={12} />
          </button>
          {chipBody}
        </div>
      ) : uploadFailed ? (
        <div className={styles.chip}>
          {renderFailureAction(
            failure,
            () => resendMessage(item.localId),
            () => cancelUpload(item.localId),
          )}
          {chipBody}
        </div>
      ) : (
        <button
          type="button"
          className={styles.chipButton}
          aria-label={t('chat.media.download', { name: filename })}
          onClick={download}
          disabled={isLoading}
        >
          {isLoading ? (
            // Тот же слот, где во время заливки крутится кольцо прогресса: состояния файла
            // читаются в одном месте — заливка, скачивание, покой.
            <span className={styles.iconBox}>
              <Spinner size="icon" />
            </span>
          ) : (
            /* Две иконки сразу: на ховере документ подменяется стрелкой скачивания.
               Переключение чистым CSS — состояние ховера не должно рендерить ряд заново. */
            <span
              className={styles.iconBox}
              aria-hidden
            >
              <span className={styles.restIcon}>
                <FileDocIcon size={20} />
              </span>
              <span className={styles.hoverIcon}>
                <DownloadIcon size={20} />
              </span>
            </span>
          )}
          {chipBody}
        </button>
      )}
      {hasCaption && (
        <MediaCaption
          body={body}
          meta={meta}
          isStatusHidden={isStatusHidden}
        />
      )}
    </div>
  )
}

// Повтор предлагаем только там, где он что-то изменит: отказ fileguard'а (тип, имя, размер)
// детерминирован, и единственное осмысленное действие — убрать черновик из ленты.
function renderFailureAction(
  failure: UploadFailure | undefined,
  onRetry: () => void,
  onRemove: () => void,
) {
  const retryable = isRetryableFailure(failure)

  return (
    <button
      type="button"
      className={styles.actionBox}
      aria-label={retryable ? t('chat.action.retryUpload') : t('chat.action.removeFile')}
      onClick={retryable ? onRetry : onRemove}
    >
      {retryable ? <RetryIcon size={20} /> : <CloseIcon size={20} />}
    </button>
  )
}
