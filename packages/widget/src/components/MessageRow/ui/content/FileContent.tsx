import type { FileTimelineItem } from '@/domain/timeline'
import { useChatActions } from '@/hooks/useChatActions'
import { useChatStore } from '@/hooks/useChatStore'
import { t } from '@/i18n'
import { ProgressRing } from '@/shared/ui/ProgressRing'
import { Spinner } from '@/shared/ui/Spinner'
import { Tooltip } from '@/shared/ui/Tooltip'
import { CloseIcon, DownloadIcon, FileDocIcon, RetryIcon } from '@/shared/ui/icons'
import { assertNever } from '@/shared/utils/assertNever'
import { cn } from '@/shared/utils/cn'
import { getFileExtension } from '@/shared/utils/fileExtension'
import { formatSize } from '@/shared/utils/formatSize'
import { parseMxcUrl } from '@/shared/utils/mxc'
import { selectMediaVerdictStatusFor } from '@/store/selectors'
import type { ReactNode } from 'react'
import styles from './FileContent.module.css'
import { useMediaDownload } from '../../hooks/useMediaDownload'
import { getMediaState, type MediaState } from '../../utils/mediaState'

interface Props {
  item: FileTimelineItem
  /** Время в конце строки под именем. Подпись к файлу рисует оболочка — пузырём над карточкой. */
  inlineMeta?: ReactNode
}

/** Карточка файла без пузыря: иконка-действие, имя, строка под ним со временем. */
export function FileContent({ item, inlineMeta }: Props) {
  const { cancelUpload, resendMessage } = useChatActions()
  const { download, isLoading } = useMediaDownload(item)
  const { filename, info, url } = item.content

  const mediaId = url ? parseMxcUrl(url)?.mediaId : undefined
  const verdict = useChatStore(selectMediaVerdictStatusFor(mediaId))
  const state = getMediaState(item, verdict === 'rejected')

  const isFailed = state.status === 'uploadFailed'
  const isRejected = state.status === 'rejected'
  const fileHint = getFileExtension(filename).toUpperCase() || formatSize(info.size)

  const renderAction = (): ReactNode => {
    switch (state.status) {
      case 'uploading':
        return (
          <button
            type="button"
            className={styles.cancelBox}
            aria-label={t('chat.action.cancelUpload')}
            onClick={() => cancelUpload(item.localId)}
          >
            <ProgressRing percent={state.pct} />
            <CloseIcon size={12} />
          </button>
        )
      case 'uploadFailed':
        return state.retryable ? (
          <button
            type="button"
            className={styles.actionBox}
            aria-label={t('chat.action.retryUpload')}
            onClick={() => resendMessage(item.localId)}
          >
            <RetryIcon size={24} />
          </button>
        ) : (
          <button
            type="button"
            className={styles.actionBox}
            aria-label={t('chat.action.removeFile')}
            onClick={() => cancelUpload(item.localId)}
          >
            <CloseIcon size={24} />
          </button>
        )
      case 'available':
        return (
          <button
            type="button"
            className={styles.downloadButton}
            aria-label={t('chat.media.download', { name: filename })}
            onClick={download}
            disabled={isLoading}
          >
            {isLoading ? (
              <Spinner size="icon" />
            ) : (
              /* На ховере иконки документ подменяется стрелкой скачивания. */
              <>
                <span
                  className={styles.restIcon}
                  aria-hidden
                >
                  <FileDocIcon />
                </span>
                <span
                  className={styles.hoverIcon}
                  aria-hidden
                >
                  <DownloadIcon />
                </span>
              </>
            )}
          </button>
        )
      // Действия нет — иконка просто обозначает файл; отбракованный гаснет вместе с именем.
      case 'rejected':
      case 'sendFailed':
        return (
          <span
            className={cn(styles.iconBox, isRejected && styles.rejected)}
            aria-hidden
          >
            <FileDocIcon />
          </span>
        )
      default:
        return assertNever(state)
    }
  }

  return (
    <div className={cn(styles.chip, isFailed && styles.chipFailed)}>
      {renderAction()}
      <span className={cn(styles.info, isRejected && styles.rejected)}>
        {/* В карточке 164px имя почти всегда обрезано — полное показываем подсказкой. */}
        <Tooltip
          label={filename}
          truncatedOnly
        >
          {(tooltipProps) => (
            <span
              className={styles.filename}
              {...tooltipProps}
            >
              {filename}
            </span>
          )}
        </Tooltip>
        <span className={styles.subline}>
          <span
            className={cn(
              styles.size,
              (isFailed || isRejected) && styles.failed,
              // причина отказа — фраза, ей нужен перенос, а не обрезка как у «PDF»/размера
              isRejected && styles.reason,
            )}
          >
            {getSubline(state, fileHint)}
          </span>
          {inlineMeta}
        </span>
      </span>
    </div>
  )
}

// Причину сбоя не разворачиваем: пользователю она ничего не меняет — что делать, говорит само
// действие рядом (повтор либо «убрать»). Различает случаи только текст aria-label кнопки.
// Причины отказа проверки сервер не присылает намеренно — берём общую формулировку.
function getSubline(state: MediaState, fileHint: string): string {
  switch (state.status) {
    case 'uploading':
      return t('composer.upload.progress', { percent: state.pct })
    case 'uploadFailed':
      return t('chat.upload.error')
    case 'rejected':
      return t('chat.media.rejected')
    case 'sendFailed':
    case 'available':
      return fileHint
    default:
      return assertNever(state)
  }
}
