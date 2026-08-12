/**
 * DTO каталога эмодзи: GET /_matrix/client/unstable/ru.otpbank.kc/emoji/v1/packs.
 *
 * При выключенной фиче сервер отдаёт пустые списки, а не 403, поэтому все коллекции необязательные.
 */

export interface EmojiWire {
  /** Канонический codepoint: hex-сегменты через дефис, без вариационного селектора (`1f469-200d-2695`). */
  codepoint: string
  /** Сам символ — фолбэк и ключ поиска в тексте. */
  e: string
}

export interface EmojiCategoryWire {
  id: string
  display_name: string
  count: number
  emoji?: EmojiWire[]
}

export interface EmojiPackWire {
  id: string
  display_name: string
  /** Cache-buster для байтов: они отдаются immutable на неделю. */
  version: string
  categories?: EmojiCategoryWire[]
}

export interface EmojiPacksResponse {
  packs?: EmojiPackWire[]
}
