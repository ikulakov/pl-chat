import type { Ref } from 'react'
import { isOptimistic } from '../../../domain/optimistic'
import type { ReactionSummary } from '../../../domain/reactions'
import { replyTargetOf } from '../../../domain/reply'
import { isMedia, type MessageTimelineItem } from '../../../domain/timeline'
import { FEATURES } from '../../../features'
import { useChatActions } from '../../../hooks/useChatActions'
import { useChatStore } from '../../../hooks/useChatStore'
import { t } from '../../../i18n'
import { Dropdown, type DropdownHandle, DropdownItem } from '../../../shared/ui/Dropdown'
import { IconButton } from '../../../shared/ui/IconButton'
import { showToast } from '../../../shared/ui/Toast'
import { CopyIcon, MoreIcon, ReplyIcon, RetryIcon } from '../../../shared/ui/icons'
import { copyText } from '../../../shared/utils/clipboard'
import { selectViewport } from '../../../store/selectors'
import { ReactionPicker } from './ReactionPicker'

interface Props {
  ref?: Ref<DropdownHandle>
  message: MessageTimelineItem
  isOwn: boolean
  reactions: ReactionSummary[]
}

export function MessageActions({ ref, message, isOwn, reactions }: Props) {
  const { resendMessage, replyTo, toggleReaction } = useChatActions()
  const viewport = useChatStore(selectViewport)

  const replyTarget = replyTargetOf(message)
  const uploadFailed = isMedia(message) && message.upload?.error

  const canRetry = isOwn && message.sendStatus === 'failed' && !uploadFailed
  const canReact = FEATURES.reactions && !isOptimistic(message.eventId)
  const canReply = replyTarget !== undefined
  const canCopy = message.content.body.trim() !== ''

  const hasMenuItems = canRetry || canReply || canCopy
  const disabled = !(hasMenuItems || canReact)

  const handleCopy = (): void => {
    void copyText(message.content.body).then((copied) => {
      if (copied && viewport === 'fullscreen') {
        showToast(t('chat.action.copied'))
      }
    })
  }

  const menuItems = hasMenuItems ? (
    <>
      {canRetry && (
        <DropdownItem
          icon={<RetryIcon />}
          onSelect={() => resendMessage(message.localId)}
        >
          {t('chat.action.retry')}
        </DropdownItem>
      )}

      {canReply && (
        <DropdownItem
          icon={<ReplyIcon />}
          onSelect={() => replyTo(replyTarget)}
        >
          {t('chat.action.reply')}
        </DropdownItem>
      )}

      {canCopy && (
        <DropdownItem
          icon={<CopyIcon />}
          onSelect={handleCopy}
        >
          {t('chat.action.copy')}
        </DropdownItem>
      )}
    </>
  ) : undefined

  return (
    <Dropdown
      ref={ref}
      disabled={disabled}
      above={
        canReact ? (
          <ReactionPicker
            summaries={reactions}
            onToggle={(key) => void toggleReaction(message.eventId, key)}
          />
        ) : undefined
      }
      trigger={(triggerProps) => (
        <IconButton
          {...triggerProps}
          variant="ghost"
          size="md"
          data-role="message-actions-trigger"
          aria-label={t('chat.action.menu')}
        >
          <MoreIcon size={18} />
        </IconButton>
      )}
    >
      {menuItems}
    </Dropdown>
  )
}
