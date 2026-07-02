import { cn } from '../shared/cn'
import { ChecksIcon } from './icons'
import styles from './MessageBubble.module.css'

type BubbleType = 'operator' | 'user'
type BubblePosition = 'single' | 'first' | 'middle' | 'last'
type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

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
      <p className={styles.text}>{children}</p>
      <div className={styles.meta}>
        <span className={styles.time}>{time}</span>
        {type === 'user' && status && status !== 'sending' && status !== 'failed' && (
          <ChecksIcon
            color={status === 'read' ? 'var(--c-purple-light)' : 'var(--c-text-invert-dim)'}
          />
        )}
        {type === 'user' && status === 'sending' && <span className={styles.statusSending}>·</span>}
        {type === 'user' && status === 'failed' && <span className={styles.statusFailed}>!</span>}
      </div>
    </div>
  )
}
