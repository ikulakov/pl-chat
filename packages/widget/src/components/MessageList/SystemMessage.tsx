import styles from './SystemMessage.module.css'

interface Props {
  children: React.ReactNode
}

export function SystemMessage({ children }: Props) {
  return (
    <div className={styles.systemRow}>
      <span
        className={styles.text}
        data-role="system-message"
      >
        {children}
      </span>
    </div>
  )
}
