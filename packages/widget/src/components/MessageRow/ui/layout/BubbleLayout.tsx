import { cn } from '@/shared/utils/cn'
import type { ReactNode } from 'react'
import type { LayoutProps, MessageGroupPosition } from '../../types'
import styles from './BubbleLayout.module.css'
import { MessageMeta } from './MessageMeta'

interface Props extends LayoutProps {
  position: MessageGroupPosition
  /**
   * Получает время, чтобы вывести его в конце текста. Если есть реакции, получает `undefined`:
   * время тогда стоит в строке с реакциями внизу пузыря.
   */
  children: (inlineMeta: ReactNode) => ReactNode
}

export function BubbleLayout({ isOwn, meta, reply, reactions, position, children }: Props) {
  const footerMeta = reactions ? (
    <div className={styles.footerMeta}>
      {reactions}
      {meta && <MessageMeta {...meta} />}
    </div>
  ) : undefined

  const inlineMeta =
    !reactions && meta ? (
      <MessageMeta
        {...meta}
        className={styles.inlineMeta}
      />
    ) : undefined

  return (
    <div
      className={cn(styles.bubble, isOwn ? styles.user : styles.operator, styles[position])}
      data-testid="message-bubble"
    >
      {reply}
      {children(inlineMeta)}
      {footerMeta}
    </div>
  )
}
