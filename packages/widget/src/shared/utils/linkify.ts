/**
 * Разбор текста сообщения на кликабельные ссылки.
 *
 * Сообщения приходят plain-текстом (`formatted_body` бэкенд не шлёт), поэтому HTML-рендера
 * и санитайзера тут нет: `href` собирается из самой распознанной подстроки, а схема ограничена
 * http/https шаблоном — `javascript:`/`data:` в него не попадают по построению.
 */

export type TextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }

// Голая ссылка: со схемой либо начинающаяся с `www.`. Хвост берём жадно до пробела, лишнюю
// пунктуацию отрезаем отдельно — иначе «зайди на https://bank.ru.» съедает точку предложения.
const BARE_URL = String.raw`(?:https?:\/\/|www\.)[^\s<>«»"]+`

// Якорь целиком: оператор шлёт HTML-разметку прямо в `body`, и без разбора она видна
// пользователю сырым тегом. Группы: кавычка, href, содержимое.
const ANCHOR = String.raw`<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>`

const LINK_RE = new RegExp(`${ANCHOR}|${BARE_URL}`, 'gi')

const TAG_RE = /<[^>]*>/g

const ENTITY_RE = /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, (raw, entity: string) => {
    if (entity.startsWith('#')) {
      const code = Number(entity.startsWith('#x') ? `0x${entity.slice(2)}` : entity.slice(1))
      return Number.isFinite(code) ? String.fromCodePoint(code) : raw
    }

    return NAMED_ENTITIES[entity.toLowerCase()] ?? raw
  })
}

/**
 * Ссылка из HTML-якоря. Схему проверяем уже после раскодирования сущностей — иначе
 * `&#106;avascript:` проскочит проверку и уедет в `href`. Всё, что не http(s), остаётся
 * текстом: подпись пользователь увидит, но кликнуть её будет нельзя.
 */
function fromAnchor(rawHref: string, rawLabel: string): TextSegment {
  const href = decodeEntities(rawHref).trim()
  const label = decodeEntities(rawLabel.replace(TAG_RE, '')).trim()

  if (!HAS_HOST.test(href)) return { kind: 'text', text: label }

  return { kind: 'link', text: label || href, href: toHref(href) }
}

// После схемы должен быть хотя бы один символ хоста: «см. https://» — это не ссылка.
const HAS_HOST = /^(?:https?:\/\/|www\.)[^\s/?#]/i

const HAS_SCHEME = /^https?:\/\//i

// Пунктуация, которая почти всегда принадлежит предложению, а не адресу.
const TRAILING = new Set([...'.,;:!?"\'»'])

function countChar(text: string, char: string): number {
  let count = 0
  for (const current of text) {
    if (current === char) count++
  }

  return count
}

/**
 * Отрезает хвост, прилипший к адресу из окружающего текста. Закрывающая скобка остаётся,
 * если она парная: `.../wiki/Ссылка_(значение)` — часть адреса, а `(см. https://bank.ru)` — нет.
 */
function trimTrailing(url: string): string {
  let end = url.length

  while (end > 0) {
    const char = url[end - 1]!

    if (char === ')') {
      const head = url.slice(0, end)
      if (countChar(head, '(') >= countChar(head, ')')) break
    } else if (!TRAILING.has(char)) {
      break
    }

    end--
  }

  return url.slice(0, end)
}

function toHref(url: string): string {
  return HAS_SCHEME.test(url) ? url : `https://${url}`
}

/**
 * Режет строку на текст и ссылки. Текст без ссылок возвращается одним сегментом — на этом
 * пути функция ничего не стоит и рендер остаётся прежним.
 */
export function splitLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let last = 0

  for (const match of text.matchAll(LINK_RE)) {
    const [raw, , rawHref, rawLabel] = match

    // Захваченный href означает якорь: его съедаем целиком, вместе с закрывающим тегом.
    // У голой ссылки съедается только то, что осталось после обрезки хвостовой пунктуации.
    const consumed = rawHref === undefined ? trimTrailing(raw) : raw
    let segment: TextSegment

    if (rawHref === undefined) {
      if (!HAS_HOST.test(consumed)) continue
      segment = { kind: 'link', text: consumed, href: toHref(consumed) }
    } else {
      segment = fromAnchor(rawHref, rawLabel ?? '')
    }

    if (match.index > last) {
      segments.push({ kind: 'text', text: text.slice(last, match.index) })
    }
    segments.push(segment)
    last = match.index + consumed.length
  }

  if (segments.length === 0) return [{ kind: 'text', text }]
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) })

  return segments
}
