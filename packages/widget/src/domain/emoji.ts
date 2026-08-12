/**
 * Разбор текста сообщения на текст и эмодзи.
 *
 * Протокол не размечает эмодзи (в отличие от Telegram с его `messageEntityCustomEmoji`): эмодзи
 * приезжают обычным юникодом в `body`, и клиент ищет их сам по каталогу сервера.
 */

/** Каталог пака: символ (без вариационного селектора) → канонический codepoint сервера. */
export interface EmojiCatalog {
  version: string
  codepointByChar: Map<string, string>
}

export type EmojiSegment =
  | { kind: 'text'; text: string }
  | { kind: 'emoji'; char: string; codepoint: string }

/** Размер отрисовки: `big` и `mid` — для сообщений из одних эмодзи, `inline` — размером со строку. */
export type EmojiLayout = 'big' | 'mid' | 'inline'

// Вариационный селектор VS16: в тексте ❤️ приезжает как 2764 fe0f, а в паке лежит как 2764.
const VARIATION_SELECTOR = /️/g

// Дешёвый отсев: в подавляющем большинстве сообщений эмодзи нет вовсе, и до сегментера
// доходить незачем.
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u

// Сколько эмодзи в сообщении без текста ещё рисуются крупно.
const MAX_LARGE_EMOJI = 3

let segmenter: Intl.Segmenter | null | undefined

/** Ключ поиска в каталоге: тот же символ, но без вариационных селекторов. */
export function normalizeEmojiKey(char: string): string {
  return char.replace(VARIATION_SELECTOR, '')
}

/**
 * Режет строку на сегменты, подставляя codepoint каталога вместо найденных эмодзи.
 *
 * Границы ищет `Intl.Segmenter` по графемным кластерам — это снимает ручную работу с UTF-16,
 * суррогатными парами и ZWJ-цепочками: 👩‍⚕️ остаётся одним кластером и не разваливается на
 * 👩 и ⚕. Пока каталога нет, весь текст остаётся текстом и рисуется системным шрифтом.
 */
export function splitEmoji(text: string, catalog: EmojiCatalog | null): EmojiSegment[] {
  if (!catalog || catalog.codepointByChar.size === 0 || !PICTOGRAPHIC.test(text)) {
    return asText(text)
  }

  const graphemes = getSegmenter()
  if (!graphemes) return asText(text)

  const segments: EmojiSegment[] = []
  let pending = ''

  for (const { segment } of graphemes.segment(text)) {
    const codepoint = catalog.codepointByChar.get(normalizeEmojiKey(segment))

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
