import { memo } from 'react'
import type { MessageTimelineItem } from '../../../domain/timeline'
import { useEmojiSegments } from '../../../hooks/useEmojiSegments'
import { ITEM_ID_ATTR } from '../../../hooks/useLoadMoreHistory'
import { RECEIPT_ID_ATTR } from '../../../hooks/useSendReadReceipts'
import { cn } from '../../../shared/utils/cn'
import { ReplyPreview } from '../../ReplyPreview'
import type { BubbleMetaData } from './BubbleMeta'
import { EmojiMessage } from './EmojiMessage'
import { FileChip } from './FileChip'
import { ImageMessage } from './ImageMessage'
import { MessageActions } from './MessageActions'
import { MessageBubble, type BubblePosition } from './MessageBubble'
import styles from './MessageRow.module.css'
import { TextContent } from './TextContent'

interface Props {
  message: MessageTimelineItem
  userId: string
  position: BubblePosition
  readByOperator: boolean
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
    replyAuthor,
    replyText,
    replyTargetId,
    onReplyClick,
  }: Props) => {
    const isOwn = message.sender === userId
    const isGroupStart = position === 'single' || position === 'first'

    const { segments, layout } = useEmojiSegments(
      message.kind === 'text' ? message.content.body : '',
    )

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

    // Сообщение из одних эмодзи рисуется крупно и без плашки. С цитатой так нельзя: её не на
    // чем показать, поэтому такое сообщение остаётся обычным баблом со строчными эмодзи.
    const emojiOnlyLayout = layout !== 'inline' && !reply ? layout : null

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
        />

        {emojiOnlyLayout ? (
          <EmojiMessage
            segments={segments}
            layout={emojiOnlyLayout}
            meta={meta}
          />
        ) : (
          <MessageBubble
            type={isOwn ? 'user' : 'operator'}
            position={position}
            reply={reply}
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
        )}
      </div>
    )
  },
)
