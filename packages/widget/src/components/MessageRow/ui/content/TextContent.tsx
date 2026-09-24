import { splitLinks, type TextSegment } from '@/shared/utils/linkify'
import type { ReactNode } from 'react'
import { EmojiText } from '../../../Emoji'
import styles from './TextContent.module.css'

interface Props {
  text: string
  isOwn: boolean
  /** Время в конце абзаца; нет — оно стоит в футере с реакциями. */
  inlineMeta?: ReactNode
}

export function TextContent({ text, isOwn, inlineMeta }: Props) {
  // Ссылки разбираем только у оператора
  const segments: TextSegment[] = isOwn ? [{ kind: 'text', text }] : splitLinks(text)

  return (
    <p className={styles.text}>
      {segments.map((segment, index) =>
        // Ключ по индексу безопасен: список пересобирается целиком при смене текста.
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
