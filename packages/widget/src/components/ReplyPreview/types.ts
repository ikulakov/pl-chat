import type { ReplyStickerPreview } from '@/domain/reply'
import type { LocalId } from '@/shared/types/ids'

export interface ReplyPreviewData {
  author?: string
  text: string
  /** Оригинал — стикер: показываем его самого. */
  sticker?: ReplyStickerPreview
  /** Цель перехода, если оригинал доступен в загруженной ленте. */
  targetId?: LocalId
}
