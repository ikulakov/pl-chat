import { useChatActions } from '../hooks/useChatActions'
import { useChatStore } from '../hooks/useChatStore'
import { t } from '../i18n'
import { IconButton } from '../shared/ui/IconButton'
import { CloseIcon } from '../shared/ui/icons'
import styles from './Header.module.css'

interface Props {
  name: string
  subtitle: string
}

export function Header({ name, subtitle }: Props) {
  const viewport = useChatStore((s) => s.viewport)
  const { close } = useChatActions()

  return (
    <header className={styles.header}>
      <div className={styles.info}>
        <span className={styles.name}>{name}</span>
        <span className={styles.status}>{subtitle}</span>
      </div>
      <div className={styles.actions}>
        {/* <IconButton variant="surface" size="md" aria-label={t('chat.menu')}>
          <SearchIcon />
        </IconButton>
        <IconButton variant="surface" size="md" aria-label={t('chat.menu')}>
          <MoreIcon />
        </IconButton> */}
        {viewport === 'fullscreen' && (
          <IconButton
            variant="surface"
            size="md"
            aria-label={t('chat.close')}
            onClick={close}
          >
            <CloseIcon />
          </IconButton>
        )}
      </div>
    </header>
  )
}
