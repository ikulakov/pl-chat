type ConsoleMethod = 'error' | 'warn'

/**
 * Короткая характеристика ошибки для прод-консоли: только поля из белого списка.
 *
 * Сам объект ошибки в прод не уходит. Рискует в нём `message`: у MatrixError это текст с
 * сервера (поле `error` ответа). Сегодня он написан для показа пользователю, но это чужая
 * гарантия, и полагаться на неё в логах нельзя. Имя класса, код протокола и HTTP-статус —
 * наши собственные значения, и их достаточно, чтобы отличить класс сбоя.
 */
function describeError(error: unknown): string {
  if (error === null || error === undefined) return ''
  if (typeof error !== 'object') return typeof error

  // Утиная типизация вместо instanceof: DOMException не везде наследник Error, а тянуть
  // MatrixError в shared/utils значило бы завязать утилиту на matrix-слой.
  const candidate = error as { name?: unknown; errcode?: unknown; status?: unknown }
  const parts: string[] = []

  if (typeof candidate.name === 'string' && candidate.name) parts.push(candidate.name)
  if (typeof candidate.errcode === 'string' && candidate.errcode) parts.push(candidate.errcode)
  if (typeof candidate.status === 'number') parts.push(String(candidate.status))

  return parts.join(' ')
}

function write(method: ConsoleMethod, message: string, error?: unknown): void {
  const prefixedMessage = `[PLChat] ${message}`

  // В прод-бандле виджета консоль хоста — единственная полевая диагностика, поэтому строку
  // печатаем всегда. Сообщения на местах вызова — статичные литералы, ПДн в них нет.
  if (!import.meta.env.DEV) {
    const description = describeError(error)
    console[method](description ? `${prefixedMessage} ${description}` : prefixedMessage)
    return
  }

  if (error === undefined) {
    console[method](prefixedMessage)
    return
  }

  // В dev передаём сам Error отдельным аргументом, чтобы консоль сохранила stack trace.
  console[method](prefixedMessage, error)
}

export const consoleDev = {
  error(message: string, error?: unknown): void {
    write('error', message, error)
  },

  warn(message: string, error?: unknown): void {
    write('warn', message, error)
  },
}
