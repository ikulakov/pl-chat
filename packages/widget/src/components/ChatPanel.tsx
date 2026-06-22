import styles from './ChatPanel.module.css'

export function ChatPanel() {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Чат поддержки</span>
        <button
          className={styles.closeBtn}
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>
      <div className={styles.body}>
        {/* <span className={styles.spinner} aria-label="Загрузка" /> */}
        Виджет подключён ✓
      </div>
    </div>
  )
}
