import type { StickerTimelineItem } from '@/domain/timeline'
import type { ReactNode } from 'react'
import { StickerView } from '../../../Emoji'
import { BubbleMeta, type BubbleMetaData } from '../bubble/BubbleMeta'
import styles from './StickerMessage.module.css'

interface Props {
  item: StickerTimelineItem
  meta: BubbleMetaData
  /** Чипы реакций: у стикера нет пузыря, поэтому они живут прямо под картинкой. */
  reactions?: ReactNode
}

// 128 из макета + 20% и ещё + 20% по правкам дизайна.
const SIZE_PX = 185

/**
 * Стикер в ленте: без плашки пузыря, время — пилюлей поверх правого нижнего угла. Ровно так же
 * ведёт себя «большое эмодзи» (`EmojiMessage`), и так стикеры выглядят в мессенджерах.
 *
 * Силуэта у входящего события нет — каталог с ним остался в пикере, а `content` его не несёт.
 * Поэтому до готовности стикера здесь пусто; место при этом зарезервировано фиксированным
 * размером, так что лента не дёргается.
 */
export function StickerMessage({ item, meta, reactions }: Props) {
  const { media, body, format } = item.content

  return (
    <div className={styles.stickerMessage}>
      {media && (
        <StickerView
          sticker={{ ...media, body, format }}
          size={SIZE_PX}
        />
      )}

      <span className={styles.meta}>
        <BubbleMeta {...meta} />
      </span>

      {reactions}
    </div>
  )
}
