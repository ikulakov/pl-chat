/**
 * Каталог эмодзи и стикеров для пикера. Протокол сообщений это не меняет: эмодзи уезжает
 * обычным юникодом в `body` текстового события, каталог нужен только чтобы нарисовать
 * вместо символа анимацию.
 */

export interface EmojiItem {
  /** Канонический codepoint без VS16: `1f600`, `1f469-200d-2695`. Адрес байтов анимации. */
  codepoint: string
  /** Символ для вставки в текст. */
  char: string
  /** data:-URL силуэта; пока анимация не приехала, в сетке рисуется он. */
  silhouette: string | null
}

export interface EmojiCategory {
  id: string
  title: string
  /** Сколько позиций во вкладке. Известно до загрузки состава — сетка резервирует место. */
  count: number
  /** null — состав ещё не загружен. */
  items: EmojiItem[] | null
}

export interface EmojiCatalog {
  version: string
  categories: EmojiCategory[]
}

export interface StickerItem {
  id: string
  /** Подпись стикера, она же alt. */
  body: string
  mediaId: string
}

export interface StickerPack {
  id: string
  title: string
  stickers: StickerItem[]
}

/**
 * Lottie-JSON анимации. Клиент его не разбирает — байты проходят от сети до плеера как есть,
 * поэтому структура намеренно непрозрачна.
 */
export type EmojiAnimation = Record<string, unknown>
