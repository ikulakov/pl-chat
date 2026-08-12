/**
 * Wire-DTO каталогов эмодзи и стикеров (KC-расширения `ru.otpbank.kc`).
 * Перевод в доменные типы — только в `matrix/mappers/emoji.ts`.
 */

export interface EmojiWire {
  codepoint: string
  /** Сам символ: его клиент вставляет в текст. */
  e: string
  /** Силуэт-плейсхолдер: 32×32 grayscale PNG в base64. Приходит только в ответе категории. */
  p?: string
}

export interface EmojiCategoryWire {
  id: string
  display_name: string
  /** Число позиций во вкладке — по нему сетка резервирует место до загрузки состава. */
  count: number
  emoji?: EmojiWire[]
}

export interface EmojiCategoriesResponse {
  /** Версия пака, она же cache-buster для байтов. */
  version: string
  categories: EmojiCategoryWire[]
}

export interface StickerInfoWire {
  mimetype?: string
  w?: number
  h?: number
  size?: number
}

export interface StickerWire {
  id: string
  body: string
  info: StickerInfoWire
  url: string
  media_id: string
}

export interface StickerPackWire {
  id: string
  display_name: string
  description?: string
  stickers: StickerWire[]
}

export interface StickerPacksResponse {
  packs: StickerPackWire[]
}
