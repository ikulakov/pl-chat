import { cn } from '../../shared/cn'
import { Spinner } from '../../shared/ui/Spinner'
import { ChecksIcon, FailedIcon } from '../icons'
import styles from './MessageBubble.module.css'

type BubbleType = 'operator' | 'user'
export type BubblePosition = 'single' | 'first' | 'middle' | 'last'
type MessageStatus = 'sending' | 'sent' | 'read' | 'failed'

interface Props {
  type: BubbleType
  position?: BubblePosition
  time: string
  status?: MessageStatus
  children: React.ReactNode
}

export function MessageBubble({ type, position = 'single', time, status, children }: Props) {
  return (
    <div className={cn(styles.bubble, styles[type], styles[position])}>
      <p className={styles.text}>
        {children}
        <span className={styles.meta}>
          <span className={styles.time}>{time}</span>

          {type === 'user' &&
            (status === 'sending' ? (
              <span className={styles.pendingSpinner}>
                <Spinner size="inline" />
              </span>
            ) : status === 'failed' ? (
              <FailedIcon />
            ) : (
              <ChecksIcon
                color={status === 'read' ? 'var(--c-purple-light)' : 'var(--c-text-invert-dim)'}
              />
            ))}
        </span>
      </p>
    </div>
  )
}
