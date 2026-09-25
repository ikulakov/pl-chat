import { cn } from '@/shared/utils/cn'
import { splitLinks, type TextSegment } from '@/shared/utils/linkify'
import type { ReactNode } from 'react'
import { EmojiText } from '../../../Emoji'
import styles from './TextContent.module.css'

interface Props {
  text: string
  isOwn: boolean
  /** Время в конце абзаца; нет — оно стоит в футере с реакциями. */
  inlineMeta?: ReactNode
  /** Отступы вокруг текста задаёт место, где он стоит (подпись под чипом файла). */
  className?: string | undefined
}

export function TextContent({ text, isOwn, inlineMeta, className }: Props) {
  // Ссылки разбираем только у оператора
  const segments: TextSegment[] = isOwn ? [{ kind: 'text', text }] : splitLinks(text)

  return (
    <p className={cn(styles.text, className)}>
      {segments.map((segment, index) =>
        segment.kind === 'link' ? (
          <a
            key={index}
            className={styles.link}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            <EmojiText text={segment.text} />
          </a>
        ) : (
          <EmojiText
            key={index}
            text={segment.text}
          />
        ),
      )}
      {inlineMeta}
    </p>
  )
}
