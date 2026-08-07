import { useChatActions } from '../hooks/useChatActions'
import { useChatStore } from '../hooks/useChatStore'
import { t } from '../i18n'
import { IconButton } from '../shared/ui/IconButton'
import { CloseIcon } from '../shared/ui/icons'
import { selectViewport } from '../store/selectors'
import styles from './Header.module.css'

interface Props {
  name: string
  subtitle: string
}

export function Header({ name, subtitle }: Props) {
  const viewport = useChatStore(selectViewport)
  const { close } = useChatActions()

  return (
    <header className={styles.header}>
      <div className={styles.info}>
        <span className={styles.name}>{name}</span>
        <span className={styles.status}>{subtitle}</span>
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
