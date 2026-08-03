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
  inline?: boolean
}

export function BubbleMeta({ ts, own, sendStatus, isRead, inline }: Props) {
  return (
    <span className={cn(styles.meta, inline && styles.inline)}>
      <span className={cn(styles.time, own && styles.timeOwn)}>{formatTime(ts)}</span>
      {own ? (
        <SendStatusIcon
          sendStatus={sendStatus}
          isRead={isRead}
        />
      ) : undefined}
    </span>
  )
}
