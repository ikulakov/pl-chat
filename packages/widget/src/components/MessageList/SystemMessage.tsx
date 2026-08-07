import type { SystemLabel } from '../../domain/timeline'
import { ITEM_ID_ATTR } from '../../hooks/useLoadMoreHistory'
import { t } from '../../i18n'
import styles from './SystemMessage.module.css'

interface Props {
  itemId: string
  label: SystemLabel
}

function resolveLabel(label: SystemLabel): string {
  return label.source === 'literal' ? label.body : t(label.key, label.params)
}

export function SystemMessage({ itemId, label }: Props) {
  return (
    <div
      className={styles.systemRow}
      // Якорь удержания позиции при подгрузке истории
      {...{ [ITEM_ID_ATTR]: itemId }}
    >
      <span
        className={styles.text}
        data-role="system-message"
      >
        {resolveLabel(label)}
      </span>
    </div>
  )
}
