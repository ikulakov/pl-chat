import type { ReactNode } from 'react'
import { cn } from '../../../shared/utils/cn'
import styles from './MessageBubble.module.css'

type BubbleType = 'operator' | 'user'
export type BubblePosition = 'single' | 'first' | 'middle' | 'last'

interface Props {
  type: BubbleType
  position?: BubblePosition
  reply?: ReactNode
  children: ReactNode
}

export function MessageBubble({ type, position = 'single', reply, children }: Props) {
  return (
    <div
      className={cn(styles.bubble, styles[type], styles[position])}
      data-role="message-bubble"
    >
      {reply}
      {children}
    </div>
  )
}
