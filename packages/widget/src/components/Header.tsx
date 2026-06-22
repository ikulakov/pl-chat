import styles from './Header.module.css'

interface Props {
  name: string
  subtitle: string
}

export function Header({ name, subtitle }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.info}>
        <span className={styles.name}>{name}</span>
        <span className={styles.status}>{subtitle}</span>
      </div>
      <div className={styles.actions}>
        {/* <button className={styles.iconBtn} aria-label={t('chat.menu')}>
          <SearchIcon />
        </button>
        <button className={styles.iconBtn} aria-label={t('chat.menu')}>
          <MoreIcon />
        </button> */}
      </div>
    </header>
  )
}
