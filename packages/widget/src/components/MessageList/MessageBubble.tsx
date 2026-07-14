import { cn } from '../../shared/cn'
import styles from './MessageBubble.module.css'

type BubbleType = 'operator' | 'user'
export type BubblePosition = 'single' | 'first' | 'middle' | 'last'

interface Props {
  type: BubbleType
  position?: BubblePosition
  time: string
  meta?: React.ReactNode
  children: React.ReactNode
}

export function MessageBubble({ type, position = 'single', time, meta, children }: Props) {
  return (
    <div
      className={cn(styles.bubble, styles[type], styles[position])}
      data-role="message-bubble"
    >
      <p className={styles.text}>
        {children}
        <span className={styles.meta}>
          <span className={styles.time}>{time}</span>
          {meta}
        </span>
      </p>
    </div>
  )
}
