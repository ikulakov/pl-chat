import type { EmojiLayout, EmojiSegment } from '../../../domain/emoji'
import { AnimatedEmoji } from '../../Emoji/AnimatedEmoji'
import { BubbleMeta, type BubbleMetaData } from './BubbleMeta'
import styles from './EmojiMessage.module.css'

interface Props {
  segments: EmojiSegment[]
  layout: Exclude<EmojiLayout, 'inline'>
  version: string
  meta: BubbleMetaData
}

const SIZE_PX: Record<Props['layout'], number> = {
  // 128 из макета −20% по правке дизайна; растр при этом остаётся 128-м (см. AnimatedEmoji).
  big: 102,
  mid: 48,
}

/**
 * Сообщение из одних эмодзи: без плашки бабла, время — пилюлей поверх правого нижнего угла.
 * Так это нарисовано в макете, и так же ведут себя стикеры в мессенджерах.
 */
export function EmojiMessage({ segments, layout, version, meta }: Props) {
  const size = SIZE_PX[layout]

  return (
    <div className={styles.emojiMessage}>
      {segments.map((segment, index) =>
        segment.kind === 'emoji' ? (
          <AnimatedEmoji
            key={index}
            char={segment.char}
            codepoint={segment.codepoint}
            version={version}
            size={size}
          />
        ) : null,
      )}

      <span className={styles.meta}>
        <BubbleMeta {...meta} />
      </span>
    </div>
  )
}
