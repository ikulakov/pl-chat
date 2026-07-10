import { memo } from 'react'
import type { MessageTimelineItem } from '../../domain/timeline'
import { cn } from '../../shared/cn'
import { formatTime } from '../../shared/formatTime'
import { MessageActions } from './MessageActions'
import { MessageBubble, type BubblePosition } from './MessageBubble'
import styles from './MessageList.module.css'

interface Props {
  message: MessageTimelineItem
  userId: string | null
  position: BubblePosition
}

export const MessageRow = memo(({ message, userId, position }: Props) => {
  const isOwn = message.sender === userId
  const canRetry = isOwn && message.sendStatus === 'failed'
  const isGroupEnd = position === 'single' || position === 'last'

  return (
    <div className={cn(styles.messageRow, isOwn && styles.own, isGroupEnd && styles.groupEnd)}>
      <MessageActions
        localId={message.localId}
        text={message.content.body}
        canRetry={canRetry}
      />

      <MessageBubble
        type={isOwn ? 'user' : 'operator'}
        position={position}
        time={formatTime(message.ts)}
        status={message.sendStatus}
      >
        {message.content.body}
      </MessageBubble>
    </div>
  )
})
