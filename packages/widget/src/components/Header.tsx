import { useChatActions } from '../hooks/useChatActions'
import { useChatStore } from '../hooks/useChatStore'
import type { MessageKey } from '../i18n'
import { t } from '../i18n'
import { IconButton } from '../shared/ui/IconButton'
import { CloseIcon } from '../shared/ui/icons'
import { cn } from '../shared/utils/cn'
import { selectHeaderStatus, selectOperatorDisplayName, selectViewport } from '../store/selectors'
import type { HeaderStatus } from '../store/state'
import styles from './Header.module.css'

const STATUS_TEXT: Record<HeaderStatus, MessageKey> = {
  connecting: 'header.connecting',
  offline: 'header.offline',
  bot: 'header.botSubtitle',
  operator: 'header.operatorSubtitle',
  error: 'header.noConnection',
}

export function Header() {
  const operatorName = useChatStore(selectOperatorDisplayName)
  const status = useChatStore(selectHeaderStatus)
  const showShimmer = status === 'connecting' || status === 'offline'

  const viewport = useChatStore(selectViewport)
  const { close } = useChatActions()

  return (
    <header className={styles.header}>
      <div className={styles.info}>
        <span className={styles.name}>{operatorName ?? t('header.name')}</span>
        <span
          className={cn(styles.status, showShimmer && styles.shimmer)}
          role="status"
        >
          {t(STATUS_TEXT[status])}
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
