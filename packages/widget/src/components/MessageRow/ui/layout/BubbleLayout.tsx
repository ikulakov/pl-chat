import { cn } from '@/shared/utils/cn'
import type { ReactNode } from 'react'
import type { LayoutProps, MessageGroupPosition } from '../../types'
import styles from './BubbleLayout.module.css'
import { MessageMeta } from './MessageMeta'

interface Props extends LayoutProps {
  position: MessageGroupPosition
  /** Кадр во всю ширину пузыря над текстом — картинка с подписью. Ширину пузыря задаёт он. */
  media?: ReactNode
  children: (inlineMeta: ReactNode) => ReactNode
}

export function BubbleLayout({ isOwn, meta, reply, reactions, position, media, children }: Props) {
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
      className={cn(
        styles.bubble,
        isOwn ? styles.user : styles.operator,
        styles[position],
        media !== undefined && styles.withMedia,
      )}
      data-testid="message-bubble"
    >
      {reply && <div className={styles.reply}>{reply}</div>}
      {media !== undefined && <div className={styles.media}>{media}</div>}
      {children(inlineMeta)}
      {footerMeta}
    </div>
  )
}
