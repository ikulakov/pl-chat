import type { ReactNode } from 'react'
import { useDropdownClose } from './context'
import styles from './DropdownItem.module.css'

interface Props {
  onSelect: () => void
  icon?: ReactNode
  children: ReactNode
}

export function DropdownItem({ onSelect, icon, children }: Props) {
  const close = useDropdownClose()

  return (
    <button
      type="button"
      role="menuitem"
      className={styles.item}
      onClick={() => {
        onSelect()
        close()
      }}
    >
      {icon}
      {children}
    </button>
  )
}
