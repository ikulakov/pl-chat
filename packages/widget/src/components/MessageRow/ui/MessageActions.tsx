import { replyTargetOf } from '@/domain/reply'
import { isMedia, type MessageTimelineItem } from '@/domain/timeline'
import { useChatActions } from '@/hooks/useChatActions'
import { useChatStore } from '@/hooks/useChatStore'
import { t } from '@/i18n'
import { Dropdown, type DropdownHandle, DropdownItem } from '@/shared/ui/Dropdown'
import { IconButton } from '@/shared/ui/IconButton'
import { showToast } from '@/shared/ui/Toast'
import { CopyFilledIcon, CopyIcon, MoreIcon, ReplyIcon, RetryIcon } from '@/shared/ui/icons'
import { copyText } from '@/shared/utils/clipboard'
import { selectViewport } from '@/store/selectors'
import type { ReactNode, Ref } from 'react'

interface Props {
  ref?: Ref<DropdownHandle>
  message: MessageTimelineItem
  isOwn: boolean
  reactionPicker?: ReactNode
}

export function MessageActions({ ref, message, isOwn, reactionPicker }: Props) {
  const { resendMessage, replyTo } = useChatActions()
  const viewport = useChatStore(selectViewport)

  const replyTarget = replyTargetOf(message)
  const uploadFailed = isMedia(message) && message.upload?.error

  const canRetry = isOwn && message.sendStatus === 'failed' && !uploadFailed
  const canReply = replyTarget !== undefined
  const canCopy = message.content.body.trim() !== ''

  const handleCopy = (): void => {
    void copyText(message.content.body).then((copied) => {
      if (copied && viewport === 'fullscreen') {
        showToast(t('chat.action.copied'), { icon: CopyFilledIcon })
      }
    })
  }

  const menuItems = [
    canRetry && (
      <DropdownItem
        key="retry"
        icon={<RetryIcon />}
        onSelect={() => resendMessage(message.localId)}
      >
        {t('chat.action.retry')}
      </DropdownItem>
    ),
    canReply && (
      <DropdownItem
        key="reply"
        icon={<ReplyIcon />}
        onSelect={() => replyTo(replyTarget)}
      >
        {t('chat.action.reply')}
      </DropdownItem>
    ),
    canCopy && (
      <DropdownItem
        key="copy"
        icon={<CopyIcon />}
        onSelect={handleCopy}
      >
        {t('chat.action.copy')}
      </DropdownItem>
    ),
  ].filter(Boolean)

  const disabled = !menuItems.length && !reactionPicker

  return (
    <Dropdown
      ref={ref}
      disabled={disabled}
      above={reactionPicker}
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
