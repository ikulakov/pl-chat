import { t } from '../../i18n'
import styles from './Spinner.module.css'

interface Props {
  size?: 'sm' | 'md'
}

export function Spinner({ size = 'md' }: Props) {
  return (
    <span
      className={`${styles.spinner} ${styles[size]}`}
      aria-label={t('status.loading')}
      role="status"
    />
  )
}
