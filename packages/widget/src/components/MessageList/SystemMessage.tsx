import { ITEM_ID_ATTR } from '../../hooks/useLoadMoreHistory'
import styles from './SystemMessage.module.css'

interface Props {
  itemId: string
  children: React.ReactNode
}

export function SystemMessage({ itemId, children }: Props) {
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
        {children}
      </span>
    </div>
  )
}
