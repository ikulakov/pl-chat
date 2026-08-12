import { Fragment } from 'react'
import { useEmojiSegments } from '../../hooks/useEmojiSegments'
import { InlineEmoji } from './InlineEmoji'

interface Props {
  text: string
}

/**
 * Текст сообщения, где известные каталогу эмодзи заменены картинками. Пока каталог не приехал
 * (или сервер отдал пустой пак) — это ровно исходная строка.
 */
export function EmojiText({ text }: Props) {
  const { segments } = useEmojiSegments(text)

  return segments.map((segment, index) =>
    segment.kind === 'text' ? (
      // Ключ по индексу безопасен: список пересобирается целиком при смене текста.
      <Fragment key={index}>{segment.text}</Fragment>
    ) : (
      <InlineEmoji
        key={index}
        char={segment.char}
        codepoint={segment.codepoint}
      />
    ),
  )
}
