import { cn } from '@/shared/utils/cn'
import type { ReactNode } from 'react'
import type { LayoutProps } from '../../types'
import { MessageMeta } from './MessageMeta'
import styles from './UnboxedLayout.module.css'

interface Props extends LayoutProps {
  children: ReactNode
}

/**
 * Оболочка сообщения без пузыря: картинка без подписи, стикер, крупные эмодзи. Время — пилюля поверх угла
 * контента, реакции — строкой под ним. Пара в пузыре — `BubbleLayout`.
 */
export function UnboxedLayout({ isOwn, meta, reply, reactions, children }: Props) {
  return (
    <div className={cn(styles.message, isOwn && styles.own)}>
      {reply && <div className={styles.reply}>{reply}</div>}

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
