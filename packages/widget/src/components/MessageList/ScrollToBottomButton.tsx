import { useChatStore } from '../../hooks/useChatStore'
import { t } from '../../i18n'
import { IconButton } from '../../shared/ui/IconButton'
import { ChevronDownIcon } from '../../shared/ui/icons'
import { selectUnreadCount } from '../../store/selectors'
import styles from './ScrollToBottomButton.module.css'

const MAX_BADGE_COUNT = 99

interface Props {
  onClick: () => void
}

export function ScrollToBottomButton({ onClick }: Props) {
  const unreadCount = useChatStore(selectUnreadCount)

  return (
    <IconButton
      variant="floating"
      size="md"
      className={styles.button}
      aria-label={
        unreadCount > 0
          ? t('chat.scroll-down-unread', { count: unreadCount })
          : t('chat.scroll-down')
      }
      onClick={onClick}
    >
      <ChevronDownIcon />
      {unreadCount > 0 && (
        <span
          className={styles.badge}
          aria-hidden="true"
        >
          {unreadCount > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : unreadCount}
        </span>
      )}
    </IconButton>
  )
}
