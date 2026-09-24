import { Spinner } from '@/shared/ui/Spinner'
import { CheckmarkDoubleIcon, CheckmarkIcon, FailedIcon } from '@/shared/ui/icons'
import { assertNever } from '@/shared/utils/assertNever'
import { cn } from '@/shared/utils/cn'
import { formatTime } from '@/shared/utils/formatTime'
import type { ReactNode } from 'react'
import type { Delivery, MessageMetaData } from '../../types'
import styles from './MessageMeta.module.css'

type Props = MessageMetaData & {
  /** Поверх контента без пузыря: тёмная подложка и белый текст. */
  overlay?: boolean
  /** Положение времени — забота оболочки: где оно стоит, решает она. */
  className?: string | undefined
}

function renderDeliveryIcon({ sendStatus, isRead }: Delivery): ReactNode {
  switch (sendStatus) {
    case 'sending':
      return (
        <span className={styles.spinnerWrap}>
          <Spinner size="inline" />
        </span>
      )
    case 'failed':
      return <FailedIcon />
    case 'sent':
      return isRead ? <CheckmarkDoubleIcon data-read="true" /> : <CheckmarkIcon data-read="false" />
    default:
      return assertNever(sendStatus)
  }
}

/**
 * Время сообщения и статус доставки своего сообщения. Отвечает только за вид, не за место.
 * Цвет на пузыре задаёт оболочка переменной `--meta-color`: он зависит от фона под временем.
 */
export function MessageMeta({ ts, delivery, overlay, className }: Props) {
  return (
    <span className={cn(styles.meta, overlay && styles.overlay, className)}>
      <span className={styles.time}>{formatTime(ts)}</span>
      {delivery && renderDeliveryIcon(delivery)}
    </span>
  )
}
