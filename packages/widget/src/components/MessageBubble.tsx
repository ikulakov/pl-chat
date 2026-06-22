import { cn } from '../shared/cn'
import { ChecksIcon } from './icons'
import styles from './MessageBubble.module.css'

type BubbleType = 'bot' | 'user'
type BubblePosition = 'single' | 'first' | 'middle' | 'last'
type MessageStatus = 'sent' | 'delivered' | 'read'

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
        {type === 'user' && status && (
          <ChecksIcon
            color={status === 'read' ? 'var(--c-purple-light)' : 'var(--c-text-invert-dim)'}
          />
        )}
      </div>
    </div>
  )
}
