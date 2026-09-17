import type {
  EmojiCatalog,
  EmojiCategory,
  EmojiIndex,
  EmojiItem,
  StickerItem,
  StickerPack,
} from '@/domain/emoji'
import { normalizeEmojiKey, toStickerFormat } from '@/domain/emoji'
import { Endpoints } from '../api/endpoints'
import type * as Matrix from '../wire'

/**
 * Каталог вкладок: состава ещё нет, есть только счётчики — по ним сетка резервирует место
 * и решает, какую категорию догружать.
 */
export function toEmojiCatalog(wire: Matrix.EmojiCategoriesResponse): EmojiCatalog {
  return {
    version: wire.version,
    categories: (wire.categories ?? []).map(toEmptyCategory),
  }
}

/** Состав одной вкладки — здесь же приезжают силуэты. */
export function toEmojiCategory(wire: Matrix.EmojiCategoryWire): EmojiCategory {
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
 * Плоский индекс для рендера ленты: символ → codepoint по всему паку.
 *
 * Ключ нормализуется так же, как при разборе текста, — без вариационного селектора. Иначе ❤️
 * (`2764 fe0f`) из сообщения не найдётся, хотя `2764` в паке есть.
 */
export function toEmojiIndex(wire: Matrix.EmojiPacksResponse): EmojiIndex {
  const packs = wire.packs ?? []
  const codepointByChar = new Map<string, string>()

  for (const pack of packs) {
    for (const category of pack.categories ?? []) {
      for (const { codepoint, e } of category.emoji ?? []) {
        codepointByChar.set(normalizeEmojiKey(e), codepoint)
      }
    }
  }

  // Версия одна на пак; паков сервер публикует ровно один, но структура допускает список.
  return { version: packs[0]?.version ?? '', codepointByChar }
}

/**
 * Паки стикеров. `url` и `info` сохраняем целиком: `info.mimetype` — единственный признак
 * рендиции (расширения в `url` нет), а пара `{body, info, url}` уезжает в `content` события
 * `m.sticker` дословно, собирать её самому не нужно.
 */
export function toStickerPacks(wire: Matrix.StickerPacksResponse): StickerPack[] {
  return (wire.packs ?? []).map((pack) => ({
    id: pack.id,
    title: pack.display_name,
    stickers: (pack.stickers ?? []).map(toStickerItem),
  }))
}

function toStickerItem(wire: Matrix.StickerWire): StickerItem {
  const mimetype = wire.info?.mimetype ?? ''

  return {
    id: wire.id,
    body: wire.body,
    mediaId: wire.media_id,
    url: wire.url,
    bytesUrl: Endpoints.STICKER_BYTES({ mediaId: wire.media_id }),
    info: { ...wire.info, mimetype },
    silhouette: wire.p ? `data:image/png;base64,${wire.p}` : null,
    format: toStickerFormat(mimetype),
  }
}

function toEmptyCategory(wire: Matrix.EmojiCategoryWire): EmojiCategory {
  return {
    id: wire.id,
    title: wire.display_name,
    count: wire.count,
    items: null,
  }
}

function toEmojiItem(wire: Matrix.EmojiWire): EmojiItem {
  return {
    codepoint: wire.codepoint,
    char: wire.e,
    silhouette: wire.p ? `data:image/png;base64,${wire.p}` : null,
  }
}
