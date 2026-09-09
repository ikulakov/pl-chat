import styles from './Spinner.module.css'

interface Props {
  size?: 'inline' | 'icon' | 'block'
}

export function Spinner({ size = 'block' }: Props) {
  return (
    <span
      className={`${styles.spinner} ${styles[size]}`}
      aria-hidden="true"
      data-role="spinner"
    />
  )
}
