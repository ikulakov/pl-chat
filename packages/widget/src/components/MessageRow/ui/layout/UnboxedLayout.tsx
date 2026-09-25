import { cn } from '@/shared/utils/cn'
import type { ReactNode } from 'react'
import type { LayoutProps } from '../../types'
import bubbleStyles from './BubbleLayout.module.css'
import { MessageMeta } from './MessageMeta'
import styles from './UnboxedLayout.module.css'

interface Props extends LayoutProps {
  /** Подпись к вложению: в пузыре над контентом, под цитатой. */
  caption?: ReactNode
  children: ReactNode
}

/**
 * Оболочка сообщения без пузыря: картинка, стикер, крупные эмодзи. Цитата и подпись — пузырём
 * над контентом, время — пилюля поверх его угла, реакции — строкой под ним. Пара в пузыре —
 * `BubbleLayout`.
 */
export function UnboxedLayout({ isOwn, meta, reply, reactions, caption, children }: Props) {
  return (
    <div className={cn(styles.message, isOwn && styles.own)}>
      {(reply || caption) && (
        <div
          className={cn(
            styles.topBubble,
            bubbleStyles.bubble,
            bubbleStyles.single,
            isOwn ? bubbleStyles.user : bubbleStyles.operator,
          )}
        >
          {reply}
          {caption}
        </div>
      )}

      <div className={styles.frame}>
        {children}

        {meta && (
          <MessageMeta
            {...meta}
            overlay
            className={styles.meta}
          />
        )}
      </div>

      {reactions}
    </div>
  )
}
