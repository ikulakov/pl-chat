import type { ReactNode } from 'react'
import styles from './DropdownItem.module.css'

interface Props {
  onSelect: () => void
  icon?: ReactNode
  children: ReactNode
}

export function DropdownItem({ onSelect, icon, children }: Props) {
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.item}
      onClick={onSelect}
    >
      {icon}
      {children}
    </button>
  )
}
