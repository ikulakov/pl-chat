/**
 * Эмодзи: каталог для пикера и разбор текста для ленты.
 *
 * Протокол сообщений это не меняет: эмодзи уезжает обычным юникодом в `body` текстового
 * события, каталог нужен только чтобы нарисовать вместо символа анимацию.
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

/**
 * Плоский индекс пака для рендера ленты: символ (без вариационного селектора) → codepoint.
 *
 * Отдельно от `EmojiCatalog`: пикеру нужны вкладки, счётчики и силуэты, и состав он догружает
 * по мере пролистывания, — а рендеру текста нужен весь список символов сразу и как можно легче.
 */
export interface EmojiIndex {
  version: string
  codepointByChar: Map<string, string>
}

export type EmojiSegment =
  | { kind: 'text'; text: string }
  | { kind: 'emoji'; char: string; codepoint: string }

/** Размер отрисовки: `big` и `mid` — для сообщений из одних эмодзи, `inline` — со строку. */
export type EmojiLayout = 'big' | 'mid' | 'inline'

// Вариационный селектор VS16: в тексте ❤️ приезжает как 2764 fe0f, а в паке лежит как 2764.
const VARIATION_SELECTOR = /️/g

// Дешёвый отсев: в подавляющем большинстве сообщений эмодзи нет вовсе, и до сегментера
// доходить незачем.
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u

// Сколько эмодзи в сообщении без текста ещё рисуются крупно.
const MAX_LARGE_EMOJI = 3

let segmenter: Intl.Segmenter | null | undefined

/** Ключ поиска в индексе: тот же символ, но без вариационных селекторов. */
export function normalizeEmojiKey(char: string): string {
  return char.replace(VARIATION_SELECTOR, '')
}

/**
 * Режет строку на сегменты, подставляя codepoint пака вместо найденных эмодзи.
 *
 * Границы ищет `Intl.Segmenter` по графемным кластерам — это снимает ручную работу с UTF-16,
 * суррогатными парами и ZWJ-цепочками: 👩‍⚕️ остаётся одним кластером и не разваливается на
 * 👩 и ⚕. Пока индекса нет, весь текст остаётся текстом и рисуется системным шрифтом.
 */
export function splitEmoji(text: string, index: EmojiIndex | null): EmojiSegment[] {
  if (!index || index.codepointByChar.size === 0 || !PICTOGRAPHIC.test(text)) {
    return asText(text)
  }

  const graphemes = getSegmenter()
  if (!graphemes) return asText(text)

  const segments: EmojiSegment[] = []
  let pending = ''

  for (const { segment } of graphemes.segment(text)) {
    const codepoint = index.codepointByChar.get(normalizeEmojiKey(segment))

    if (codepoint === undefined) {
      // Не эмодзи или эмодзи не из пака (тона кожи, флаги стран) — остаётся текстом.
      pending += segment
      continue
    }

    if (pending) {
      segments.push({ kind: 'text', text: pending })
      pending = ''
    }
    segments.push({ kind: 'emoji', char: segment, codepoint })
  }

  if (pending) segments.push({ kind: 'text', text: pending })

  return segments
}

/**
 * Размер отрисовки по составу сообщения: одно эмодзи без текста — большое, два-три — средние,
 * всё остальное — строчный размер.
 */
export function emojiLayout(segments: EmojiSegment[]): EmojiLayout {
  let count = 0

  for (const segment of segments) {
    if (segment.kind === 'emoji') {
      count += 1
      continue
    }
    // Пробелы и переносы между эмодзи не делают сообщение текстовым.
    if (segment.text.trim() !== '') return 'inline'
  }

  if (count === 1) return 'big'
  if (count > 1 && count <= MAX_LARGE_EMOJI) return 'mid'

  return 'inline'
}

function asText(text: string): EmojiSegment[] {
  return text ? [{ kind: 'text', text }] : []
}

function getSegmenter(): Intl.Segmenter | null {
  // Считаем один раз: конструктор сегментера дорогой, а результат от вызова к вызову не меняется.
  segmenter ??=
    typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      : null

  return segmenter
}
