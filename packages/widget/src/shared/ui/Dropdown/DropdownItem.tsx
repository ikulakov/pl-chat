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
      onClick={(event) => {
        onSelect()
        // detail — число кликов: у мыши ≥ 1, у Enter/Space 0. С клавиатуры фокус возвращаем на
        // триггер, мышью — нет, иначе :focus-within оставил бы «…» видимым после закрытия.
        close({ returnFocus: event.detail === 0 })
      }}
    >
      {icon}
      {children}
    </button>
  )
}
