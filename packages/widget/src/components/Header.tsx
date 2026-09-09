import { useChatActions } from '../hooks/useChatActions'
import { useChatStore } from '../hooks/useChatStore'
import type { MessageKey } from '../i18n'
import { t } from '../i18n'
import { IconButton } from '../shared/ui/IconButton'
import { CloseIcon } from '../shared/ui/icons'
import { cn } from '../shared/utils/cn'
import { selectOperatorDisplayName, selectStatusLine, selectViewport } from '../store/selectors'
import type { StatusLine } from '../store/state'
import styles from './Header.module.css'

const STATUS_TEXT: Partial<Record<StatusLine, MessageKey>> = {
  connecting: 'header.connecting',
  offline: 'header.offline',
  bot: 'header.botSubtitle',
  operator: 'header.operatorSubtitle',
}

export function Header() {
  const operatorName = useChatStore(selectOperatorDisplayName)
  const status = useChatStore(selectStatusLine)
  const statusText = STATUS_TEXT[status] ? t(STATUS_TEXT[status]) : ''
  const isPendingStatus = status === 'connecting' || status === 'offline'

  const viewport = useChatStore(selectViewport)
  const { close } = useChatActions()

  return (
    <header className={styles.header}>
      <div className={styles.info}>
        <span className={styles.name}>{operatorName ?? t('header.name')}</span>
        <span
          className={cn(styles.status, isPendingStatus && styles.pending)}
          role="status"
        >
          {statusText}
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
