import { memo } from 'react'
import { cn } from '../../shared/cn'
import { formatTime } from '../../shared/formatTime'
import type { ChatMessage } from '../../store/model'
import { MessageActions } from './MessageActions'
import { MessageBubble, type BubblePosition } from './MessageBubble'
import { deriveMessageStatus } from './MessageList.helpers'
import styles from './MessageList.module.css'

interface Props {
  message: ChatMessage
  userId: string | null
  position: BubblePosition
  onRetry: (localId: string) => void
}

export const MessageRow = memo(({ message, userId, position, onRetry }: Props) => {
  const isOwn = message.sender === userId
  const canRetry = isOwn && message.failed
  const isGroupEnd = position === 'single' || position === 'last'

  return (
    <div className={cn(styles.messageRow, isOwn && styles.own, isGroupEnd && styles.groupEnd)}>
      <MessageActions
        text={message.body}
        canRetry={canRetry}
        onRetry={() => onRetry(message.localId)}
      />

      <MessageBubble
        type={isOwn ? 'user' : 'operator'}
        position={position}
        time={formatTime(message.ts)}
        status={deriveMessageStatus(message)}
      >
        {message.body}
      </MessageBubble>
    </div>
  )
})
