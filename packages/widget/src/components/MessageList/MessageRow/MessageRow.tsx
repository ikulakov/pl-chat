import type { LocalId, UserId } from '@/shared/types/ids'
import { aggregateReactions, type ReactionEntry } from '@/domain/reactions'
import { replyTargetOf, type ReplyStickerPreview } from '@/domain/reply'
import { type MessageTimelineItem } from '@/domain/timeline'
import { useChatActions } from '@/hooks/useChatActions'
import { useEmojiSegments } from '@/hooks/useEmojiSegments'
import { useMessageGestures } from './useMessageGestures'
import { FEATURES } from '@/shared/features'
import { ITEM_ID_ATTR, RECEIPT_ID_ATTR } from '../domAttributes'
import type { DropdownHandle } from '@/shared/ui/Dropdown'
import { ReplyIcon } from '@/shared/ui/icons'
import { assertNever } from '@/shared/utils/assertNever'
import { cn } from '@/shared/utils/cn'
import { memo, useMemo, useRef, type ReactNode } from 'react'
import { ReplyPreview } from '../../ReplyPreview/ReplyPreview'
import { AdaptiveCardActions } from './content/AdaptiveCardActions'
import type { BubbleMetaData } from './bubble/BubbleMeta'
import { EmojiMessage } from './content/EmojiMessage'
import { FileChip } from './content/FileChip'
import { ImageMessage } from './content/ImageMessage'
import { MessageActions } from './MessageActions'
import { MessageBubble, type BubblePosition } from './bubble/MessageBubble'
import styles from './MessageRow.module.css'
import { ReactionBar } from './reactions/ReactionBar'
import { StickerMessage } from './content/StickerMessage'
import { TextContent } from './content/TextContent'

interface Props {
  message: MessageTimelineItem
  userId: UserId
  position: BubblePosition
  readByOperator: boolean
  reactions: ReactionEntry[] | undefined
  replyAuthor: string | undefined
  replyText: string | undefined
  replySticker: ReplyStickerPreview | undefined
  replyTargetId: LocalId | undefined
  onReplyClick: (localId: LocalId) => void
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
    const isOwn = message.sender === userId
    const isGroupStart = position === 'single' || position === 'first'
    const replyTarget = replyTargetOf(message)
    const { replyTo, toggleReaction } = useChatActions()

    const rowRef = useRef<HTMLDivElement>(null)
    const dropdownRef = useRef<DropdownHandle>(null)

    const { isSwiping } = useMessageGestures(rowRef, {
      onLongPress: () =>
        rowRef.current && dropdownRef.current?.open({ anchor: rowRef.current, backdrop: true }),
      onSwipe: replyTarget ? () => replyTo(replyTarget) : undefined,
    })

    const { segments, layout, version } = useEmojiSegments(
      message.kind === 'text' ? message.content.body : '',
    )

    // Свёртка — новая коллекция на выходе, поэтому живёт здесь, а не в селекторе.
    // При выключённой фиче реакции продолжают копиться в сторе, но в ленту не попадают.
    const summaries = useMemo(
      () => (FEATURES.reactions ? aggregateReactions(reactions, userId) : []),
      [reactions, userId],
    )

    const reply = replyText ? (
      <ReplyPreview
        author={replyAuthor}
        text={replyText}
        sticker={replySticker}
        onClick={replyTargetId ? () => onReplyClick(replyTargetId) : undefined}
      />
    ) : undefined

    // Один узел на все ветки: реакции одинаково нужны и пузырю, и картинке, и стикеру.
    const reactionBar =
      summaries.length > 0 ? (
        <ReactionBar
          summaries={summaries}
          onToggle={(key) => void toggleReaction(message.eventId, key)}
        />
      ) : undefined

    // Сообщение из одних эмодзи рисуется крупно и без плашки. С цитатой и с реакциями так
    // нельзя: их не на чем показать, поэтому такое сообщение остаётся обычным баблом со
    // строчными эмодзи.
    const emojiOnlyLayout = layout !== 'inline' && !reply && !reactionBar ? layout : null

    const bubbleProps = {
      type: isOwn ? 'user' : 'operator',
      position,
      reply,
      reactions: reactionBar,
    } as const

    const meta: BubbleMetaData = {
      ts: message.ts,
      own: isOwn,
      sendStatus: message.sendStatus,
      isRead: readByOperator,
    }

    const renderContent = (): ReactNode => {
      switch (message.kind) {
        case 'sticker':
          return (
            <StickerMessage
              item={message}
              meta={meta}
              reactions={reactionBar}
            />
          )
        case 'image':
          return (
            <ImageMessage
              item={message}
              meta={meta}
              reply={reply}
              reactions={reactionBar}
            />
          )
        case 'file':
          return (
            <div className={styles.content}>
              <MessageBubble {...bubbleProps}>
                <FileChip
                  item={message}
                  meta={meta}
                />
              </MessageBubble>
            </div>
          )
        case 'text':
        case 'adaptiveCard':
          return emojiOnlyLayout ? (
            <EmojiMessage
              segments={segments}
              layout={emojiOnlyLayout}
              version={version}
              meta={meta}
            />
          ) : (
            <div className={styles.content}>
              <MessageBubble {...bubbleProps}>
                <TextContent
                  text={message.content.body}
                  meta={meta}
                />
              </MessageBubble>
              {message.kind === 'adaptiveCard' && <AdaptiveCardActions item={message} />}
            </div>
          )

        default:
          return assertNever(message)
      }
    }

    return (
      <div
        ref={rowRef}
        className={cn(
          styles.messageRow,
          isOwn && styles.own,
          isGroupStart && styles.groupStart,
          isSwiping && styles.swiping,
        )}
        // Маркер для учета прочитанных сообщений клиентом
        {...{ [RECEIPT_ID_ATTR]: !isOwn ? message.eventId : undefined }}
        // Якорь удержания позиции при подгрузке истории
        {...{ [ITEM_ID_ATTR]: message.localId }}
      >
        <MessageActions
          ref={dropdownRef}
          message={message}
          isOwn={isOwn}
          reactions={summaries}
        />

        {isSwiping && (
          <span
            className={styles.swipeHint}
            aria-hidden="true"
          >
            <ReplyIcon />
          </span>
        )}

        {renderContent()}
      </div>
    )
  },
)
