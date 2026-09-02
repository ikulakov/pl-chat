import { splitLinks, type TextSegment } from '../../../shared/utils/linkify'
import { EmojiText } from '../../Emoji/EmojiText'
import { BubbleMeta, type BubbleMetaData } from './BubbleMeta'
import styles from './TextContent.module.css'

interface Props {
  text: string
  meta: BubbleMetaData
}

export function TextContent({ text, meta }: Props) {
  // Ссылки разбираем только у оператора
  const segments: TextSegment[] = meta.own ? [{ kind: 'text', text }] : splitLinks(text)

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
      <BubbleMeta {...meta} />
    </p>
  )
}
