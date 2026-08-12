import { memo, useMemo } from 'react'
import { aggregateReactions, type ReactionEntry } from '../../../domain/reactions'
import type { MessageTimelineItem } from '../../../domain/timeline'
import { useChatActions } from '../../../hooks/useChatActions'
import { ITEM_ID_ATTR } from '../../../hooks/useLoadMoreHistory'
import { RECEIPT_ID_ATTR } from '../../../hooks/useSendReadReceipts'
import { cn } from '../../../shared/utils/cn'
import { ReplyPreview } from '../../ReplyPreview'
import type { BubbleMetaData } from './BubbleMeta'
import { FileChip } from './FileChip'
import { ImageMessage } from './ImageMessage'
import { MessageActions } from './MessageActions'
import { MessageBubble, type BubblePosition } from './MessageBubble'
import styles from './MessageRow.module.css'
import { ReactionBar } from './ReactionBar'
import { TextContent } from './TextContent'

interface Props {
  message: MessageTimelineItem
  userId: string
  position: BubblePosition
  readByOperator: boolean
  reactions: ReactionEntry[] | undefined
  replyAuthor: string | undefined
  replyText: string | undefined
  replyTargetId: string | undefined
  onReplyClick: (localId: string) => void
}

export const MessageRow = memo(
  ({
    userId,
    message,
    position,
    readByOperator,
    reactions,
    replyAuthor,
    replyText,
    replyTargetId,
    onReplyClick,
  }: Props) => {
    const { toggleReaction } = useChatActions()
    const isOwn = message.sender === userId
    const isGroupStart = position === 'single' || position === 'first'

    // Свёртка — новая коллекция на выходе, поэтому живёт здесь, а не в селекторе.
    const summaries = useMemo(() => aggregateReactions(reactions, userId), [reactions, userId])

    const meta: BubbleMetaData = {
      ts: message.ts,
      own: isOwn,
      sendStatus: message.sendStatus,
      isRead: readByOperator,
    }

    const reply = replyText ? (
      <ReplyPreview
        author={replyAuthor}
        text={replyText}
        onClick={replyTargetId ? () => onReplyClick(replyTargetId) : undefined}
      />
    ) : undefined

    return (
      <div
        className={cn(styles.messageRow, isOwn && styles.own, isGroupStart && styles.groupStart)}
        // Маркер для учета прочитанных сообщений клиентом
        {...{ [RECEIPT_ID_ATTR]: !isOwn ? message.eventId : undefined }}
        // Якорь удержания позиции при подгрузке истории
        {...{ [ITEM_ID_ATTR]: message.localId }}
      >
        <MessageActions
          message={message}
          isOwn={isOwn}
          reactions={summaries}
        />

        <MessageBubble
          type={isOwn ? 'user' : 'operator'}
          position={position}
          reply={reply}
          reactions={
            summaries.length > 0 ? (
              <ReactionBar
                summaries={summaries}
                onToggle={(key) => void toggleReaction(message.eventId, key)}
              />
            ) : undefined
          }
        >
          {message.kind === 'image' ? (
            <ImageMessage
              item={message}
              meta={meta}
            />
          ) : message.kind === 'file' ? (
            <FileChip
              item={message}
              meta={meta}
            />
          ) : (
            <TextContent
              text={message.content.body}
              meta={meta}
            />
          )}
        </MessageBubble>
      </div>
    )
  },
)
