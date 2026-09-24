import type { EmojiSegment } from '@/domain/emoji'
import { AnimatedEmoji, type EmojiLayout } from '../../../Emoji'

interface Props {
  segments: EmojiSegment[]
  layout: Exclude<EmojiLayout, 'inline'>
  version: string
}

const SIZE_PX: Record<Props['layout'], number> = {
  // 128 из макета −20% по правке дизайна; растр при этом остаётся 128-м (см. AnimatedEmoji).
  big: 102,
  mid: 48,
}

/** Сообщение из одних эмодзи, крупно и без пузыря — оболочку даёт `UnboxedLayout`. */
export function EmojiContent({ segments, layout, version }: Props) {
  const size = SIZE_PX[layout]

  return segments.map((segment, index) =>
    segment.kind === 'emoji' ? (
      <AnimatedEmoji
        key={index}
        char={segment.char}
        codepoint={segment.codepoint}
        version={version}
        size={size}
      />
    ) : null,
  )
}
