import { memo, useMemo } from 'react'
import { aggregateReactions, type ReactionEntry } from '../../../domain/reactions'
import type { ReplyStickerPreview } from '../../../domain/reply'
import { type MessageTimelineItem } from '../../../domain/timeline'
import { useChatActions } from '../../../hooks/useChatActions'
import { useEmojiSegments } from '../../../hooks/useEmojiSegments'
import { ITEM_ID_ATTR } from '../../../hooks/useLoadMoreHistory'
import { RECEIPT_ID_ATTR } from '../../../hooks/useSendReadReceipts'
import { cn } from '../../../shared/utils/cn'
import { ReplyPreview } from '../../ReplyPreview'
import { AdaptiveCardActions } from './AdaptiveCardActions'
import type { BubbleMetaData } from './BubbleMeta'
import { EmojiMessage } from './EmojiMessage'
import { StickerMessage } from './StickerMessage'
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
  replySticker: ReplyStickerPreview | undefined
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
    replySticker,
    replyTargetId,
    onReplyClick,
  }: Props) => {
    const { toggleReaction } = useChatActions()
    const isOwn = message.sender === userId
    const isGroupStart = position === 'single' || position === 'first'

    const { segments, layout, version } = useEmojiSegments(
      message.kind === 'text' ? message.content.body : '',
    )

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
        sticker={replySticker}
        onClick={replyTargetId ? () => onReplyClick(replyTargetId) : undefined}
      />
    ) : undefined

    // Сообщение из одних эмодзи рисуется крупно и без плашки. С цитатой и с реакциями так
    // нельзя: их не на чем показать, поэтому такое сообщение остаётся обычным баблом со
    // строчными эмодзи.
    const emojiOnlyLayout = layout !== 'inline' && !reply && summaries.length === 0 ? layout : null

    // Один узел на все ветки: реакции одинаково нужны и пузырю, и картинке, и стикеру.
    const reactionBar =
      summaries.length > 0 ? (
        <ReactionBar
          summaries={summaries}
          onToggle={(key) => void toggleReaction(message.eventId, key)}
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

        {/* Стикер — до пузыря: тернарник внутри него заканчивается catch-all'ом TextContent,
            и без этой ветки стикер отрисовался бы своей эмодзи-подписью вместо картинки. */}
        {message.kind === 'sticker' ? (
          <StickerMessage
            item={message}
            meta={meta}
            reactions={reactionBar}
          />
        ) : message.kind === 'image' ? (
          <ImageMessage
            item={message}
            meta={meta}
            reply={reply}
            reactions={reactionBar}
          />
        ) : emojiOnlyLayout ? (
          <EmojiMessage
            segments={segments}
            layout={emojiOnlyLayout}
            version={version}
            meta={meta}
          />
        ) : (
          <div className={styles.content}>
            <MessageBubble
              type={isOwn ? 'user' : 'operator'}
              position={position}
              reply={reply}
              reactions={reactionBar}
            >
              {message.kind === 'file' ? (
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

            {message.kind === 'adaptiveCard' && <AdaptiveCardActions item={message} />}
          </div>
        )}
      </div>
    )
  },
)
