import { isOptimistic } from '../../../domain/optimistic'
import type { ReactionSummary } from '../../../domain/reactions'
import { replyText } from '../../../domain/reply'
import { isMedia, type MessageTimelineItem } from '../../../domain/timeline'
import { useChatActions } from '../../../hooks/useChatActions'
import { t } from '../../../i18n'
import { copyText } from '../../../shared/utils/clipboard'
import { Dropdown, DropdownItem } from '../../../shared/ui/Dropdown'
import { IconButton } from '../../../shared/ui/IconButton'
import { CopyIcon, MoreIcon, ReplyIcon, RetryIcon } from '../../../shared/ui/icons'
import { ReactionPicker } from './ReactionPicker'

interface Props {
  message: MessageTimelineItem
  isOwn: boolean
  reactions: ReactionSummary[]
}

export function MessageActions({ message, isOwn, reactions }: Props) {
  const { resendMessage, replyTo, toggleReaction } = useChatActions()

  const reply = replyText(message)

  const uploadFailed = isMedia(message) && message.upload?.error
  const canRetry = isOwn && message.sendStatus === 'failed' && !uploadFailed
  // Реакция адресует событие на сервере — у черновика его ещё нет.
  const canReact = !isOptimistic(message.eventId)
  const canReply = canReact && reply !== ''
  const canCopy = message.content.body.trim() !== ''

  const disabled = !(canRetry || canReply || canCopy || canReact)

  return (
    <Dropdown
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
          disabled={disabled}
        >
          <MoreIcon size={18} />
        </IconButton>
      )}
    >
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
          onSelect={() =>
            replyTo({
              eventId: message.eventId,
              sender: message.sender,
              body: reply,
            })
          }
        >
          {t('chat.action.reply')}
        </DropdownItem>
      )}

      {canCopy && (
        <DropdownItem
          icon={<CopyIcon />}
          onSelect={() => copyText(message.content.body)}
        >
          {t('chat.action.copy')}
        </DropdownItem>
      )}
    </Dropdown>
  )
}
