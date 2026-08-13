import type { ReactNode } from 'react'
import { toStickerFormat } from '../../../domain/emoji'
import type { StickerTimelineItem } from '../../../domain/timeline'
import { parseMxcUrl } from '../../../shared/utils/mxc'
import { StickerView } from '../../Sticker/StickerView'
import { BubbleMeta, type BubbleMetaData } from './BubbleMeta'
import styles from './StickerMessage.module.css'

interface Props {
  item: StickerTimelineItem
  meta: BubbleMetaData
  /** Чипы реакций: у стикера нет пузыря, поэтому они живут прямо под картинкой. */
  reactions?: ReactNode
}

const SIZE_PX = 128

/**
 * Стикер в ленте: без плашки пузыря, время — пилюлей поверх правого нижнего угла. Ровно так же
 * ведёт себя «большое эмодзи» (`EmojiMessage`), и так стикеры выглядят в мессенджерах.
 *
 * Силуэта у входящего события нет — каталог с ним остался в пикере, а `content` его не несёт.
 * Поэтому до готовности стикера здесь пусто; место при этом зарезервировано фиксированным
 * размером, так что лента не дёргается.
 */
export function StickerMessage({ item, meta, reactions }: Props) {
  const mediaId = parseMxcUrl(item.content.url)?.mediaId

  return (
    <div className={styles.stickerMessage}>
      {mediaId && (
        <StickerView
          sticker={{
            mediaId,
            body: item.content.body,
            format: toStickerFormat(item.content.info.mimetype),
          }}
          size={SIZE_PX}
        />
      )}

      <span className={styles.meta}>
        <BubbleMeta
          {...meta}
          inline
        />
      </span>

      {reactions}
    </div>
  )
}
