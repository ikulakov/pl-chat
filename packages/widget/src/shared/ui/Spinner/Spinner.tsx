import { cn } from '../../utils/cn'
import styles from './Spinner.module.css'

interface Props {
  size?: 'inline' | 'icon' | 'block'
  /** не показывать первые 300ms */
  delayed?: boolean
}

export function Spinner({ size = 'block', delayed = false }: Props) {
  return (
    <span
      className={cn(styles.spinner, styles[size], delayed && styles.delayed)}
      aria-hidden="true"
      data-role="spinner"
    />
  )
}
