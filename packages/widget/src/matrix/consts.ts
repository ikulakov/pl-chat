export const MATRIX_API_PREFIX = '/_matrix/client/v3'

// Размер страницы истории. Лимит на сервере считает все события (m.room.member, m.reaction и т.п.),
// Максимум сервера — 100.
export const HISTORY_PAGE_SIZE = 50

// Максимальное кол-во страниц для просмотра на случай если все HISTORY_PAGE_SIZE события будут не целевыми
export const MAX_HISTORY_PAGES_PER_CALL = 5

// Базовая пауза перед ретраем догрузки истории; растёт вдвое каждую попытку (backoff).
// Количество попыток не ограничено — ретраим, пока вызывающий разрешает (пользователь у верха).
export const HISTORY_RETRY_BASE_MS = 1_000

// Потолок backoff-паузы: пользователь стоит у верха и ждёт — паузы длиннее бессмысленны.
export const HISTORY_RETRY_MAX_MS = 10_000

export const MatrixEventType = {
  RoomMessage: 'm.room.message',
  OperatorCurrent: 'kc.operator.current',
  OperatorJoined: 'kc.operator.joined',
  OperatorLeft: 'kc.operator.left',
  Receipt: 'm.receipt',
} as const

export const MsgType = {
  Text: 'm.text',
  Notice: 'm.notice',
} as const

export const ReceiptType = {
  Read: 'm.read',
} as const

export const OperatorStatus = {
  Active: 'active',
  Left: 'left',
} as const
