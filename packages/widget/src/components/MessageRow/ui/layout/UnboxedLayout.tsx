import { cn } from '@/shared/utils/cn'
import type { ReactNode } from 'react'
import type { LayoutProps } from '../../types'
import bubbleStyles from './BubbleLayout.module.css'
import { MessageMeta } from './MessageMeta'
import styles from './UnboxedLayout.module.css'

interface Props extends LayoutProps {
  /** Подпись к вложению. */
  caption?: ReactNode
  /** Ограничение плашки цитаты по ширине в 212px */
  narrowReply?: boolean
  /**
   * Обычно время рисует оболочка, пилюлей поверх кадра.
   * Функция нужна, когда контент ставит время сам (карточка файла).
   */
  children: ReactNode | ((inlineMeta: ReactNode) => ReactNode)
}

/**
 * Layout сообщения без пузыря: картинка, файл, стикер, крупные эмодзи.
 * Цитата и подпись — пузырём над контентом, реакции — строкой под ним.
 */
export function UnboxedLayout({
  isOwn,
  meta,
  reply,
  reactions,
  caption,
  narrowReply = false,
  children,
}: Props) {
  const content =
    typeof children === 'function' ? (
      children(meta && <MessageMeta {...meta} />)
    ) : (
      <>
        {children}
        {meta && (
          <MessageMeta
            {...meta}
            overlay
            className={styles.meta}
          />
        )}
      </>
    )

  return (
    <div className={cn(styles.message, isOwn && styles.own)}>
      <div className={styles.stack}>
        {(reply || caption) && (
          <div
            className={cn(
              styles.topBubble,
              narrowReply && styles.narrowReply,
              bubbleStyles.bubble,
              bubbleStyles.single,
              isOwn ? bubbleStyles.user : bubbleStyles.operator,
            )}
          >
            {reply && <div className={styles.reply}>{reply}</div>}
            {caption}
          </div>
        )}

        <div className={styles.frame}>{content}</div>
      </div>

      {reactions}
    </div>
  )
}
