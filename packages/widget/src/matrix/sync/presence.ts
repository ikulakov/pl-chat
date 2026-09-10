// Значения query-параметра `set_presence` у GET /sync. Сервер бампит активность только на
// `online`/`unavailable`; сам по себе long-poll её не трогает — иначе фоновая вкладка висела
// бы online вечно. `offline` не шлём: закрытие вкладки сервер ловит сам по обрыву long-poll'а.
export const SetPresence = {
  Online: 'online',
  Unavailable: 'unavailable',
} as const

export type SetPresence = (typeof SetPresence)[keyof typeof SetPresence]

/**
 * Присутствие клиента для очередного `/sync`.
 *
 * Активная вкладка — `online`, любая другая — `unavailable`. Свёрнутая панель чата на это не
 * влияет: клиент остаётся на странице и ответ оператора увидит, «свернул» и «ушёл» — разное.
 * Из фоновой вкладки петля продолжает идти — она нужна счётчику непрочитанных.
 */
export function currentPresence(): SetPresence {
  return document.visibilityState === 'visible' ? SetPresence.Online : SetPresence.Unavailable
}
