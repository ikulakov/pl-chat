import type { ReplyTarget } from '@/domain/reply'
import { t } from '@/i18n'
import type { UserId } from '@/shared/types/ids'
import { IconButton } from '@/shared/ui/IconButton'
import { CloseIcon } from '@/shared/ui/icons'
import { getReplyQuotePreview, ReplyPreview } from '../ReplyPreview'
import styles from './ReplyBanner.module.css'

interface Props {
  target: ReplyTarget
  userId: UserId | null
  onCancel: () => void
}

export function ReplyBanner({ target, userId, onCancel }: Props) {
  return (
    <div className={styles.banner}>
      <div className={styles.preview}>
        <ReplyPreview reply={getReplyQuotePreview(target, userId)} />
      </div>
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={t('chat.reply.cancel')}
        onClick={onCancel}
      >
        <CloseIcon size={16} />
      </IconButton>
    </div>
  )
}
