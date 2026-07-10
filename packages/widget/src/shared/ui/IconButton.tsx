import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../cn'
import styles from './IconButton.module.css'

type Variant = 'surface' | 'floating' | 'ghost' | 'accent'
type Size = 'sm' | 'md'

type AccessibleName = { 'aria-label': string } | { 'aria-labelledby': string }

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  AccessibleName & {
    ref?: Ref<HTMLButtonElement>
    variant?: Variant
    size?: Size
    children: ReactNode
  }

export function IconButton({
  variant = 'surface',
  size,
  type = 'button',
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={cn(styles.base, styles[variant], size && styles[size], className)}
      {...rest}
    >
      {children}
    </button>
  )
}
