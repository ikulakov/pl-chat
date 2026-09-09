import { useChatActions } from '../hooks/useChatActions'
import { useChatStore } from '../hooks/useChatStore'
import type { MessageKey } from '../i18n'
import { t } from '../i18n'
import { IconButton } from '../shared/ui/IconButton'
import { CloseIcon } from '../shared/ui/icons'
import { cn } from '../shared/utils/cn'
import {
  isConnectionPending,
  selectOperatorDisplayName,
  selectStatus,
  selectViewport,
} from '../store/selectors'
import type { ChatStatus } from '../store/state'
import styles from './Header.module.css'

// В `error` строки нет: там `StatusScreen` уже всё сказал заголовком и кнопкой «Повторить».
const STATUS_KEY: Record<ChatStatus, MessageKey | null> = {
  idle: 'header.connecting',
  connecting: 'header.connecting',
  offline: 'header.offline',
  operator: 'header.operatorSubtitle',
  bot: 'header.botSubtitle',
  error: null,
}

export function Header() {
  const operatorName = useChatStore(selectOperatorDisplayName)
  const status = useChatStore(selectStatus)
  const viewport = useChatStore(selectViewport)
  const { close } = useChatActions()

  const statusKey = STATUS_KEY[status]

  return (
    <header className={styles.header}>
      <div className={styles.info}>
        <span className={styles.name}>{operatorName ?? t('header.name')}</span>
        <span
          className={cn(styles.status, isConnectionPending(status) && styles.pending)}
          role="status"
        >
          {statusKey ? t(statusKey) : ''}
        </span>
      </div>
      <div className={styles.actions}>
        {viewport === 'fullscreen' && (
          <IconButton
            variant="surface"
            size="md"
            aria-label={t('chat.close')}
            onClick={close}
          >
            <CloseIcon size={18} />
          </IconButton>
        )}
      </div>
    </header>
  )
}
