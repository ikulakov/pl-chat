import type { ReactNode } from 'react'
import { cn } from '../../../shared/utils/cn'
import styles from './MessageBubble.module.css'

type BubbleType = 'operator' | 'user'
export type BubblePosition = 'single' | 'first' | 'middle' | 'last'

interface Props {
  type: BubbleType
  position?: BubblePosition
  reply?: ReactNode
  reactions?: ReactNode
  children: ReactNode
}

export function MessageBubble({ type, position = 'single', reply, reactions, children }: Props) {
  return (
    <div
      className={cn(styles.bubble, styles[type], styles[position])}
      data-role="message-bubble"
    >
      {reply}
      {children}
      {/* слот, а не рендер внутри контента: реакции одинаково нужны тексту, картинке и файлу */}
      {reactions}
    </div>
  )
}
