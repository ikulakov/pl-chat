import { t } from '@/i18n'
import type { LocalId } from '@/shared/types/ids'
import { cn } from '@/shared/utils/cn'
import type { ReactNode } from 'react'
import { EmojiText, StickerView } from '../../Emoji'
import type { ReplyPreviewData } from '../types'
import styles from './ReplyPreview.module.css'

/** Со строку текста цитаты: стикер здесь — иконка, а не картинка. */
const STICKER_PX = 16

interface Props {
  reply: ReplyPreviewData
  onNavigate?: ((localId: LocalId) => void) | undefined
}

export function ReplyPreview({ reply, onNavigate }: Props) {
  const { author, text, sticker, targetId } = reply
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

  if (!targetId || !onNavigate) {
    return (
      <div
        className={styles.reply}
        data-testid="reply-preview"
      >
        {body}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={cn(styles.reply, styles.clickable)}
      data-testid="reply-preview"
      onClick={() => onNavigate(targetId)}
      aria-label={t('chat.reply.goToOriginal')}
    >
      {body}
    </button>
  )
}
