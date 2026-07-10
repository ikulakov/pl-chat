import { useChatActions } from '../../hooks/useChatActions'
import { t } from '../../i18n'
import { Dropdown, DropdownItem } from '../../shared/ui/Dropdown'
import { IconButton } from '../../shared/ui/IconButton'
import { CopyIcon, MoreIcon, RetryIcon } from '../../shared/ui/icons'
import { copyText } from './MessageList.helpers'

interface Props {
  localId: string
  text: string
  canRetry: boolean
}

export function MessageActions({ localId, text, canRetry }: Props) {
  const { resendMessage } = useChatActions()

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
      {({ close }) => (
        <>
          {canRetry && (
            <DropdownItem
              icon={<RetryIcon size={18} />}
              onSelect={() => {
                resendMessage(localId)
                close()
              }}
            >
              {t('chat.action.retry')}
            </DropdownItem>
          )}

          <DropdownItem
            icon={<CopyIcon size={18} />}
            onSelect={() => {
              copyText(text)
              close()
            }}
          >
            {t('chat.action.copy')}
          </DropdownItem>
        </>
      )}
    </Dropdown>
  )
}
