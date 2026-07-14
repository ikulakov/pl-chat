import type { SendStatus } from '../../domain/timeline'
import { Spinner } from '../../shared/ui/Spinner'
import { ChecksIcon, FailedIcon } from '../../shared/ui/icons'
import styles from './SendStatusIcon.module.css'

interface Props {
  sendStatus?: SendStatus
  isRead?: boolean
}

export function SendStatusIcon({ sendStatus: status, isRead }: Props) {
  if (status === 'sending') {
    return (
      <span className={styles.spinnerWrap}>
        <Spinner size="inline" />
      </span>
    )
  }
  if (status === 'failed') {
    return <FailedIcon />
  }
  return <ChecksIcon color={isRead ? 'var(--c-purple-light)' : 'var(--c-text-invert-dim)'} />
}
