import type { SystemLabel } from '@/domain/timeline'
import { t } from '@/i18n'
import styles from './SystemMessage.module.css'

interface Props {
  label: SystemLabel
}

function resolveLabel(label: SystemLabel): string {
  return label.source === 'literal' ? label.body : t(label.key, label.params)
}

export function SystemMessage({ label }: Props) {
  return (
    <div className={styles.systemRow}>
      <span
        className={styles.text}
        data-role="system-message"
      >
        {resolveLabel(label)}
      </span>
    </div>
  )
}
