import type { ReactNode } from 'react'
import { t } from '../i18n'
import { cn } from '../shared/cn'
import styles from './QuotedMessage.module.css'

interface Props {
  author: string | undefined
  text: string
  // задан только когда оригинал в загруженной ленте
  onClick?: (() => void) | undefined
}

export function QuotedMessage({ author, text, onClick }: Props) {
  const body: ReactNode = (
    <>
      {author && <span className={styles.author}>{author}</span>}
      <span className={styles.text}>{text}</span>
    </>
  )

  if (!onClick) {
    return <div className={styles.quote}>{body}</div>
  }

  return (
    <button
      type="button"
      className={cn(styles.quote, styles.clickable)}
      onClick={onClick}
      aria-label={t('chat.reply.goToOriginal')}
    >
      {body}
    </button>
  )
}
