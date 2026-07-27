import { memo } from 'react'
import type { MessageTimelineItem } from '../../domain/timeline'
import { ITEM_ID_ATTR } from '../../hooks/useLoadMoreHistory'
import { RECEIPT_ID_ATTR } from '../../hooks/useSendReadReceipts'
import { cn } from '../../shared/cn'
import { formatTime } from '../../shared/formatTime'
import { QuotedMessage } from '../QuotedMessage'
import { MessageActions } from './MessageActions'
import { MessageBubble, type BubblePosition } from './MessageBubble'
import styles from './MessageList.module.css'
import { SendStatusIcon } from './SendStatusIcon'

interface Props {
  message: MessageTimelineItem
  userId: string
  position: BubblePosition
  readByOperator: boolean
  quotedAuthor: string | undefined
  quotedText: string | undefined
  quotedTargetId: string | undefined
  onQuoteClick: (localId: string) => void
}

export const MessageRow = memo(
  ({
    userId,
    message,
    position,
    readByOperator,
    quotedAuthor,
    quotedText,
    quotedTargetId,
    onQuoteClick,
  }: Props) => {
    const isOwn = message.sender === userId
    const isGroupEnd = position === 'single' || position === 'last'

    return (
      <div
        className={cn(styles.messageRow, isOwn && styles.own, isGroupEnd && styles.groupEnd)}
        // Маркер для учета прочитанных сообщений клиентом
        {...{ [RECEIPT_ID_ATTR]: !isOwn ? message.eventId : undefined }}
        // Якорь удержания позиции при подгрузке истории
        {...{ [ITEM_ID_ATTR]: message.localId }}
      >
        <MessageActions
          message={message}
          isOwn={isOwn}
        />

        <MessageBubble
          type={isOwn ? 'user' : 'operator'}
          position={position}
          time={formatTime(message.ts)}
          quote={
            quotedText ? (
              <QuotedMessage
                author={quotedAuthor}
                text={quotedText}
                onClick={quotedTargetId ? () => onQuoteClick(quotedTargetId) : undefined}
              />
            ) : undefined
          }
          meta={
            isOwn ? (
              <SendStatusIcon
                sendStatus={message.sendStatus}
                isRead={readByOperator}
              />
            ) : undefined
          }
        >
          {message.content.body}
        </MessageBubble>
      </div>
    )
  },
)
