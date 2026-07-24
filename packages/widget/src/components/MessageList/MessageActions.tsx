import { isOptimistic } from '../../domain/optimistic'
import type { MessageTimelineItem } from '../../domain/timeline'
import { useChatActions } from '../../hooks/useChatActions'
import { t } from '../../i18n'
import { Dropdown, DropdownItem } from '../../shared/ui/Dropdown'
import { IconButton } from '../../shared/ui/IconButton'
import { CopyIcon, MoreIcon, ReplyIcon, RetryIcon } from '../../shared/ui/icons'
import { copyText } from '../../shared/clipboard'

interface Props {
  message: MessageTimelineItem
  isOwn: boolean
}

export function MessageActions({ message, isOwn }: Props) {
  const { resendMessage, replyTo } = useChatActions()

  const canRetry = isOwn && message.sendStatus === 'failed'
  const canReply = !isOptimistic(message.eventId)

  return (
    <Dropdown
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
              body: message.content.body,
            })
          }
        >
          {t('chat.action.reply')}
        </DropdownItem>
      )}

      <DropdownItem
        icon={<CopyIcon />}
        onSelect={() => copyText(message.content.body)}
      >
        {t('chat.action.copy')}
      </DropdownItem>
    </Dropdown>
  )
}
