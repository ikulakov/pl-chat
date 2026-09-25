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
        onToggle={(key) => {
          onToggleReaction(key)
          dropdownRef.current?.close()
        }}
      />
    ) : undefined

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
          if (layout !== 'inline') {
            return (
              <UnboxedLayout {...layoutProps}>
                <EmojiContent
                  segments={segments}
                  layout={layout}
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
                  isOwn={isOwn}
                  inlineMeta={inlineMeta}
                />
              )}
            </BubbleLayout>
          )
        case 'image':
          return (
            <UnboxedLayout
              {...layoutProps}
              caption={
                message.content.body.length > 0 ? (
                  <TextContent
                    text={message.content.body}
                    isOwn={isOwn}
                  />
                ) : undefined
              }
            >
              <ImageContent item={message} />
            </UnboxedLayout>
          )
        case 'sticker':
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
