import type { ReactNode } from 'react'
import { t } from '../i18n'
import { cn } from '../shared/utils/cn'
import { EmojiText } from './Emoji/EmojiText'
import styles from './ReplyPreview.module.css'

interface Props {
  author: string | undefined
  text: string
  // задан только когда оригинал в загруженной ленте
  onClick?: (() => void) | undefined
}

export function ReplyPreview({ author, text, onClick }: Props) {
  const body: ReactNode = (
    <>
      {author && <span className={styles.author}>{author}</span>}
      <span className={styles.text}>
        <EmojiText text={text} />
      </span>
    </>
  )

  if (!onClick) {
    return <div className={styles.reply}>{body}</div>
  }

  return (
    <button
      type="button"
      className={cn(styles.reply, styles.clickable)}
      onClick={onClick}
      aria-label={t('chat.reply.goToOriginal')}
    >
      {body}
    </button>
  )
}
