import type { EmojiCatalog, EmojiCategory, EmojiItem, StickerPack } from '../../domain/emoji'
import type {
  EmojiCategoriesResponse,
  EmojiCategoryWire,
  EmojiWire,
  StickerPacksResponse,
} from '../wire/emoji'

/**
 * Каталог вкладок: состава ещё нет, есть только счётчики — по ним сетка резервирует место
 * и решает, какую категорию догружать.
 */
export function toEmojiCatalog(wire: EmojiCategoriesResponse): EmojiCatalog {
  return {
    version: wire.version,
    categories: (wire.categories ?? []).map(toEmptyCategory),
  }
}

/** Состав одной вкладки — здесь же приезжают силуэты. */
export function toEmojiCategory(wire: EmojiCategoryWire): EmojiCategory {
  const items = (wire.emoji ?? []).map(toEmojiItem)

  return {
    ...toEmptyCategory(wire),
    // Счётчик из ответа может разойтись с длиной состава (позиция без байтов не отдаётся),
    // а сетка после загрузки рисует ровно то, что пришло — иначе останутся вечные заглушки.
    count: items.length,
    items,
  }
}

/**
 * Паки стикеров. `url`/`info` из каталога здесь не сохраняем: пикеру нужен только `media_id`
 * для публичного адреса байтов, а готовый `content` для `m.sticker` понадобится вместе с
 * отправкой — её в этой итерации нет.
 */
export function toStickerPacks(wire: StickerPacksResponse): StickerPack[] {
  return (wire.packs ?? []).map((pack) => ({
    id: pack.id,
    title: pack.display_name,
    stickers: (pack.stickers ?? []).map((sticker) => ({
      id: sticker.id,
      body: sticker.body,
      mediaId: sticker.media_id,
    })),
  }))
}

function toEmptyCategory(wire: EmojiCategoryWire): EmojiCategory {
  return {
    id: wire.id,
    title: wire.display_name,
    count: wire.count,
    items: null,
  }
}

function toEmojiItem(wire: EmojiWire): EmojiItem {
  return {
    codepoint: wire.codepoint,
    char: wire.e,
    silhouette: wire.p ? `data:image/png;base64,${wire.p}` : null,
  }
}
