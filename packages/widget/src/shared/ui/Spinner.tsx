import { t } from '../../i18n'
import styles from './Spinner.module.css'

interface Props {
  size?: 'inline' | 'block'
}

export function Spinner({ size = 'block' }: Props) {
  return (
    <span
      className={`${styles.spinner} ${styles[size]}`}
      aria-label={t('status.loading')}
      role="status"
    />
  )
}
