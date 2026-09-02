import type { SendStatus } from '../../../domain/timeline'
import { Spinner } from '../../../shared/ui/Spinner'
import { CheckmarkDoubleIcon, CheckmarkIcon, FailedIcon } from '../../../shared/ui/icons'
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
    return <FailedIcon className={styles.failed} />
  }
  return isRead ? <CheckmarkDoubleIcon data-read="true" /> : <CheckmarkIcon data-read="false" />
}
