import type { StickerTimelineItem } from '@/domain/timeline'
import { StickerView } from '../../../Emoji'

interface Props {
  item: StickerTimelineItem
}

// 128 из макета + 20% и ещё + 20% по правкам дизайна.
const SIZE_PX = 185

/**
 * Стикер в ленте, без пузыря — оболочку даёт `UnboxedLayout`.
 *
 * Силуэта у входящего события нет — каталог с ним остался в пикере, а `content` его не несёт.
 * Поэтому до готовности стикера здесь пусто; место при этом зарезервировано фиксированным
 * размером, так что лента не дёргается.
 */
export function StickerContent({ item }: Props) {
  const { media, body, format } = item.content

  if (!media) return null

  return (
    <StickerView
      sticker={{ ...media, body, format }}
      size={SIZE_PX}
    />
  )
}
