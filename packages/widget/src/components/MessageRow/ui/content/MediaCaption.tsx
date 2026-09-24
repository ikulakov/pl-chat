import type { ReactNode } from 'react'
import { EmojiText } from '../../../Emoji'
import styles from './MediaCaption.module.css'

interface Props {
  body: string
  /** Время в конце подписи — обтекается её последней строкой. */
  inlineMeta?: ReactNode
}

/** Подпись к вложению. Без `inlineMeta` время стоит в другом месте (пилюля, футер с реакциями). */
export function MediaCaption({ body, inlineMeta }: Props) {
  return (
    <p className={styles.caption}>
      <EmojiText text={body} />
      {inlineMeta}
    </p>
  )
}
