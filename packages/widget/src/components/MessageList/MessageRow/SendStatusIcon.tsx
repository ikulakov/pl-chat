import type { SendStatus } from '../../../domain/timeline'
import { Spinner } from '../../../shared/ui/Spinner'
import { ChecksIcon, FailedIcon } from '../../../shared/ui/icons'
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
  // Непрочитанные галочки — той же переменной, что и время: на пилюле поверх ленты белое
  // сливается с подложкой, см. BubbleMeta.module.css.
  return (
    <ChecksIcon
      color={isRead ? 'var(--c-purple-light)' : 'var(--meta-own-color, var(--c-text-invert-dim))'}
    />
  )
}
