import { t, type MessageKey } from '@/i18n'
import { IconButton } from '@/shared/ui/IconButton'
import { Tooltip } from '@/shared/ui/Tooltip'
import { CloseIcon, FileDocIcon } from '@/shared/ui/icons'
import { cn } from '@/shared/utils/cn'
import { getFileExtension, type FileRejection } from '@/shared/utils/fileValidation'
import { formatSize } from '@/shared/utils/formatSize'
import type { PendingAttachment } from '../Attachment/useAttachmentState'
import styles from './AttachmentPreview.module.css'

interface Props {
  pending: PendingAttachment
  onCancel: () => void
}

const REJECTION_TEXT: Record<FileRejection, MessageKey> = {
  badType: 'composer.upload.badType',
  tooLarge: 'composer.upload.tooLarge',
}

/**
 * Вложение до отправки. Отбракованный файл показывается здесь же с причиной — отправку
 * блокирует композер. Загрузка начинается позже, её статус живёт на сообщении в ленте.
 */
export function AttachmentPreview({ pending, onCancel }: Props) {
  const { error } = pending

  const extension = getFileExtension(pending.file.name).toUpperCase()
  const fileHint = extension || formatSize(pending.file.size)
  const meta = error ? t(REJECTION_TEXT[error]) : fileHint

  return (
    <div className={styles.attachment}>
      {pending.previewUrl ? (
        <img
          className={styles.thumb}
          src={pending.previewUrl}
          alt={pending.file.name}
        />
      ) : (
        <span
          className={cn(styles.icon, error && styles.iconError)}
          aria-hidden
        >
          <FileDocIcon />
        </span>
      )}
      <div className={styles.info}>
        <div className={cn(styles.name)}>
          <Tooltip
            label={pending.file.name}
            truncatedOnly
          >
            {(tooltipProps) => (
              <span
                className={styles.fileName}
                {...tooltipProps}
              >
                {pending.file.name}
              </span>
            )}
          </Tooltip>
        </div>
        <Tooltip
          label={meta}
          truncatedOnly
        >
          {(tooltipProps) => (
            <div
              className={cn(styles.meta, error && styles.metaError)}
              {...tooltipProps}
            >
              {meta}
            </div>
          )}
        </Tooltip>
      </div>
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={t('composer.attach.cancel')}
        onClick={onCancel}
      >
        <CloseIcon size={16} />
      </IconButton>
    </div>
  )
}
