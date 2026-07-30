import { t } from '../../i18n'
import type { PendingAttachment } from '../Attachment/useAttachmentState'
import { cn } from '../../shared/cn'
import { formatSize } from '../../shared/formatSize'
import { IconButton } from '../../shared/ui/IconButton'
import { CloseIcon, FailedIcon, FileDocIcon } from '../../shared/ui/icons'
import styles from './AttachmentPreview.module.css'

interface Props {
  pending: PendingAttachment
  onCancel: () => void
}

/**
 * Вложение до отправки. Отбракованный файл показывается здесь же с причиной — отправку
 * блокирует композер. Загрузка начинается позже, её статус живёт на сообщении в ленте.
 */
export function AttachmentPreview({ pending, onCancel }: Props) {
  const { error } = pending

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
          <FileDocIcon size={20} />
        </span>
      )}
      <div className={styles.info}>
        <div className={cn(styles.name)}>
          <span className={styles.fileName}>{pending.file.name}</span>
          {error && <FailedIcon size={14} />}
        </div>
        <div className={cn(styles.meta, error && styles.metaError)}>
          {error ?? formatSize(pending.file.size)}
        </div>
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
