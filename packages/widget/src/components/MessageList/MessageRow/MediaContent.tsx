import type { MediaTimelineItem } from '../../../domain/timeline'
import { useChatActions } from '../../../hooks/useChatActions'
import { t } from '../../../i18n'
import { cn } from '../../../shared/cn'
import { getFileExtension } from '../../../shared/fileValidation'
import { formatSize } from '../../../shared/formatSize'
import { CloseIcon, FileDocIcon, ImageIcon } from '../../../shared/ui/icons'
import { BubbleMeta, type BubbleMetaData } from './BubbleMeta'
import styles from './MediaContent.module.css'

interface Props {
  item: MediaTimelineItem
  meta: BubbleMetaData
}

export function MediaContent({ item, meta }: Props) {
  const { cancelUpload } = useChatActions()
  const { body, filename, info } = item.content

  const hasCaption = body.length > 0

  // upload есть только у своего черновика; pct null — загрузка не идёт (упала)
  const pct = item.upload?.pct ?? null
  const isUploading = pct !== null && item.sendStatus === 'sending'
  const uploadFailed = item.sendStatus === 'failed' && item.upload !== undefined

  const extension = getFileExtension(filename).toUpperCase()
  const fileHint = extension || formatSize(info.size)

  const subline = uploadFailed
    ? t('chat.upload.error')
    : isUploading
      ? t('composer.upload.progress', { percent: pct })
      : fileHint

  return (
    <div className={styles.media}>
      <div className={styles.chip}>
        {isUploading ? (
          <button
            type="button"
            className={styles.cancelBox}
            aria-label={t('chat.action.cancelUpload')}
            onClick={() => cancelUpload(item.localId)}
          >
            <CloseIcon size={20} />
          </button>
        ) : (
          <span
            className={styles.iconBox}
            aria-hidden
          >
            {item.kind === 'image' ? <ImageIcon size={20} /> : <FileDocIcon size={20} />}
          </span>
        )}
        <span className={styles.info}>
          <span className={styles.filename}>{filename}</span>
          <span className={styles.subline}>
            <span className={cn(styles.size, uploadFailed && styles.failed)}>{subline}</span>
            {!hasCaption && (
              <BubbleMeta
                {...meta}
                inline
              />
            )}
          </span>
        </span>
      </div>
      {hasCaption && (
        <p className={styles.caption}>
          {body}
          <BubbleMeta {...meta} />
        </p>
      )}
    </div>
  )
}
