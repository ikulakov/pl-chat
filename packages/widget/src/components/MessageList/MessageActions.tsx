import { t } from '../../i18n'
import { Dropdown, DropdownItem } from '../../shared/ui/Dropdown'
import { IconButton } from '../../shared/ui/IconButton'
import { CopyIcon, MoreIcon, RetryIcon } from '../../shared/ui/icons'

interface Props {
  text: string
  canRetry: boolean
  onRetry: () => void
}

export function MessageActions({ text, canRetry, onRetry }: Props) {
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
                onRetry()
                close()
              }}
            >
              {t('chat.action.retry')}
            </DropdownItem>
          )}

          <DropdownItem
            icon={<CopyIcon size={18} />}
            onSelect={() => {
              void navigator.clipboard.writeText(text)
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
