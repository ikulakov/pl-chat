import type { ReactNode } from 'react'
import styles from './StatusScreen.module.css'

interface Props {
  children?: ReactNode
  illustration?: string
  title?: string
  subtitle?: string
  action?: ReactNode
}

export function StatusScreen({ children, illustration, title, subtitle, action }: Props) {
  let media: ReactNode = null

  if (children != null) {
    media = children
  } else if (illustration != null) {
    media = (
      <div
        className={styles.illustrationWrap}
        aria-hidden="true"
      >
        <img
          src={illustration}
          alt={title}
          className={styles.illustrationImg}
        />
      </div>
    )
  }
  return (
    <div className={styles.screen}>
      {media}
      {(title || subtitle) && (
        <div className={styles.textBlock}>
          {title && <p className={illustration ? styles.titleLarge : styles.title}>{title}</p>}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      )}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
