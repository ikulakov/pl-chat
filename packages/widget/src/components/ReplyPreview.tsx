import type { ReactNode } from 'react'
import type { ReplyStickerPreview } from '../domain/reply'
import { t } from '../i18n'
import { cn } from '../shared/utils/cn'
import { EmojiText } from './Emoji/EmojiText'
import styles from './ReplyPreview.module.css'
import { StickerView } from './Sticker/StickerView'

/** Со строку текста цитаты: стикер здесь — иконка, а не картинка. */
const STICKER_PX = 16

interface Props {
  author: string | undefined
  text: string
  /** Оригинал — стикер: показываем его самого, см. ReplyStickerPreview. */
  sticker?: ReplyStickerPreview | undefined
  // задан только когда оригинал в загруженной ленте
  onClick?: (() => void) | undefined
}

export function ReplyPreview({ author, text, sticker, onClick }: Props) {
  const body: ReactNode = (
    <>
      {author && <span className={styles.author}>{author}</span>}
      <span className={styles.text}>
        {sticker && (
          <span className={styles.sticker}>
            <StickerView
              sticker={sticker}
              size={STICKER_PX}
            />
          </span>
        )}
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
