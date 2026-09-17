import { Toast } from './Toast'
import styles from './Toast.module.css'
import { useToastQueue } from './toastStore'

/**
 * Место, где показывается текущий тост очереди: по одному, следующий — после ухода предыдущего.
 * Монтируется внутри MessageList, чтобы `top` отсчитывался от ленты, а не от iframe/шапки.
 *
 * Регионов два, и оба висят в DOM всегда: ошибка объявляется assertive (`alert`), успешное
 * действие — polite (`status`). Один узел с меняющейся ролью не годится — скринридер
 * запоминает роль живого региона в момент его появления в дереве, и подмену на лету может
 * не объявить вовсе. Пустой регион не занимает места, поэтому плашка всегда на одном месте.
 */
export function ToastOutlet() {
  const queue = useToastQueue()
  const current = queue[0] ?? null

  const toast = current ? (
    <Toast
      key={current.id}
      toast={current}
    />
  ) : null

  return (
    <div className={styles.viewport}>
      <div
        className={styles.region}
        role="alert"
      >
        {current?.tone === 'error' && toast}
      </div>
      <div
        className={styles.region}
        role="status"
      >
        {current?.tone === 'success' && toast}
      </div>
    </div>
  )
}
