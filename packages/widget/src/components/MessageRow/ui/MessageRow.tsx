import { replyTargetOf } from '@/domain/reply'
import { isMedia, type MessageTimelineItem } from '@/domain/timeline'
import { useChatActions } from '@/hooks/useChatActions'
import type { LocalId, UserId } from '@/shared/types/ids'
import type { DropdownHandle } from '@/shared/ui/Dropdown'
import { ReplyIcon } from '@/shared/ui/icons'
import { assertNever } from '@/shared/utils/assertNever'
import { cn } from '@/shared/utils/cn'
import { memo, useRef, type ReactNode } from 'react'
import { useEmojiSegments } from '../../Emoji'
import { getMessageReplyPreview, ReplyPreview } from '../../ReplyPreview'
import { useMessageGestures } from '../hooks/useMessageGestures'
import { useMessageReactions } from '../hooks/useMessageReactions'
import type { LayoutProps, MessageGroupPosition } from '../types'
import { getMediaUploadView } from '../utils/mediaUploadView'
import { AdaptiveCardActions } from './content/AdaptiveCardActions'
import { EmojiContent } from './content/EmojiContent'
import { FileContent } from './content/FileContent'
import { ImageContent } from './content/ImageContent'
import { MediaCaption } from './content/MediaCaption'
import { StickerContent } from './content/StickerContent'
import { TextContent } from './content/TextContent'
import { BubbleLayout } from './layout/BubbleLayout'
import { UnboxedLayout } from './layout/UnboxedLayout'
import { MessageActions } from './MessageActions'
import styles from './MessageRow.module.css'
import { ReactionBar } from './reactions/ReactionBar'
import { ReactionPicker } from './reactions/ReactionPicker'

interface Props {
  message: MessageTimelineItem
  userId: UserId
  position: MessageGroupPosition
  readByOperator: boolean
  replyParent: MessageTimelineItem | undefined
  onReplyNavigate: (localId: LocalId) => void
}

export const MessageRow = memo(
  ({ userId, message, position, readByOperator, replyParent, onReplyNavigate }: Props) => {
    const isOwn = message.sender === userId
    const isGroupStart = position === 'single' || position === 'first'
    const swipeReplyTarget = replyTargetOf(message)
    const { replyTo } = useChatActions()

    const rowRef = useRef<HTMLDivElement>(null)
    const dropdownRef = useRef<DropdownHandle>(null)

    const { isSwiping } = useMessageGestures(rowRef, {
      onLongPress: () => {
        if (rowRef.current) {
          dropdownRef.current?.open({ anchor: rowRef.current, backdrop: true })
        }
      },
      onSwipe: swipeReplyTarget ? () => replyTo(swipeReplyTarget) : undefined,
    })

    const { segments, layout, version } = useEmojiSegments(
      message.kind === 'text' ? message.content.body : '',
    )

    const {
      summaries,
      canReact,
      toggle: onToggleReaction,
    } = useMessageReactions({
      eventId: message.eventId,
      userId,
    })

    const replyPreviewData = getMessageReplyPreview({ parent: replyParent, message, userId })
    const replyPreview = replyPreviewData ? (
      <ReplyPreview
        reply={replyPreviewData}
        onNavigate={onReplyNavigate}
      />
    ) : undefined

    const reactionBar =
      summaries.length > 0 ? (
        <ReactionBar
          summaries={summaries}
          onToggle={onToggleReaction}
        />
      ) : undefined

    const reactionPicker = canReact ? (
      <ReactionPicker
        summaries={summaries}
        onToggle={onToggleReaction}
      />
    ) : undefined

    // Эмодзи с цитатой остаются строчными в пузыре: слот цитаты у UnboxedLayout по ширине
    // контента, и над одиночным эмодзи её сплющит. Реакции крупным эмодзи не мешают.
    // TODO: когда будет макет цитаты над крупным эмодзи и стикером — дать цитате без пузыря
    // свою ширину (с потолком, а не min-width: 100%) и снять здесь !replyPreviewData.
    const emojiOnlyLayout = layout !== 'inline' && !replyPreviewData ? layout : null

    const layoutProps: LayoutProps = {
      isOwn,
      meta:
        isMedia(message) && getMediaUploadView(message).isMetaHidden
          ? null
          : {
              ts: message.ts,
              delivery: isOwn ? { sendStatus: message.sendStatus, isRead: readByOperator } : null,
            },
      reply: replyPreview,
      reactions: reactionBar,
    }

    const renderTextBubble = (text: string): ReactNode => (
      <BubbleLayout
        {...layoutProps}
        position={position}
      >
        {(inlineMeta) => (
          <TextContent
            text={text}
            isOwn={isOwn}
            inlineMeta={inlineMeta}
          />
        )}
      </BubbleLayout>
    )

    const renderMessage = (): ReactNode => {
      switch (message.kind) {
        case 'text':
          if (emojiOnlyLayout) {
            return (
              <UnboxedLayout {...layoutProps}>
                <EmojiContent
                  segments={segments}
                  layout={emojiOnlyLayout}
                  version={version}
                />
              </UnboxedLayout>
            )
          }
          return renderTextBubble(message.content.body)
        case 'adaptiveCard':
          return (
            <div className={styles.adaptiveCardStack}>
              {renderTextBubble(message.content.body)}
              <AdaptiveCardActions item={message} />
            </div>
          )
        case 'file':
          return (
            <BubbleLayout
              {...layoutProps}
              position={position}
            >
              {(inlineMeta) => (
                <FileContent
                  item={message}
                  inlineMeta={inlineMeta}
                />
              )}
            </BubbleLayout>
          )
        case 'image':
          // С подписью кадр — верх пузыря, а подпись и время под ним; без подписи кадр стоит
          // сам по себе, и время — пилюлей на нём.
          if (message.content.body.length > 0) {
            return (
              <BubbleLayout
                {...layoutProps}
                position={position}
                media={<ImageContent item={message} />}
              >
                {(inlineMeta) => (
                  <MediaCaption
                    body={message.content.body}
                    inlineMeta={inlineMeta}
                  />
                )}
              </BubbleLayout>
            )
          }
          return (
            <UnboxedLayout {...layoutProps}>
              <ImageContent item={message} />
            </UnboxedLayout>
          )
        case 'sticker':
          // TODO: ответ стикером бэкенд пока не поддерживает — когда появится, сверить цитату
          // над стикером с макетом (слот reply у UnboxedLayout уже передаётся).
          return (
            <UnboxedLayout {...layoutProps}>
              <StickerContent item={message} />
            </UnboxedLayout>
          )
        default:
          return assertNever(message)
      }
    }

    return (
      <div
        ref={rowRef}
        className={cn(styles.messageRow, isOwn && styles.own, isGroupStart && styles.groupStart)}
        data-testid="message-row"
      >
        <MessageActions
          ref={dropdownRef}
          message={message}
          isOwn={isOwn}
          reactionPicker={reactionPicker}
        />

        {isSwiping && (
          <span
            className={styles.swipeHint}
            data-testid="message-swipe-hint"
            aria-hidden="true"
          >
            <ReplyIcon />
          </span>
        )}

        {renderMessage()}
      </div>
    )
  },
)
