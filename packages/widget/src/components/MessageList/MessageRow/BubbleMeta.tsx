import type { SendStatus } from '../../../domain/timeline'
import { cn } from '../../../shared/utils/cn'
import { formatTime } from '../../../shared/utils/formatTime'
import styles from './BubbleMeta.module.css'
import { SendStatusIcon } from './SendStatusIcon'

export interface BubbleMetaData {
  ts: number
  own: boolean
  sendStatus: SendStatus
  isRead: boolean
}

interface Props extends BubbleMetaData {
  isStatusHidden?: boolean
}

export function BubbleMeta({ ts, own, sendStatus, isRead, isStatusHidden }: Props) {
  return (
    <span className={cn(styles.meta, own && styles.metaOwn)}>
      <span className={styles.time}>{formatTime(ts)}</span>
      {own && !isStatusHidden ? (
        <SendStatusIcon
          sendStatus={sendStatus}
          isRead={isRead}
        />
      ) : undefined}
    </span>
  )
}
