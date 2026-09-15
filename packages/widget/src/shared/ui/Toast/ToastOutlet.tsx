import { Toast } from './Toast'
import styles from './Toast.module.css'
import { useToastQueue } from './toastStore'

/**
 * Место, где показывается текущий тост очереди: по одному, следующий — после ухода предыдущего.
 * Монтируется один раз на всё время жизни виджета.
 *
 * `role="alert"` уже означает `aria-live="assertive"`, отдельный атрибут не нужен.
 */
export function ToastOutlet() {
  const queue = useToastQueue()
  const current = queue[0] ?? null

  return (
    <div
      className={styles.viewport}
      role="alert"
    >
      {current && (
        <Toast
          key={current.id}
          toast={current}
        />
      )}
    </div>
  )
}
