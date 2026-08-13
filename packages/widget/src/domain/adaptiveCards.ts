import type { SendStatus } from './timeline'

export interface AdaptiveCardPayload extends Record<string, unknown> {
  type: 'AdaptiveCard'
  version?: string
  body?: unknown[]
  actions?: unknown[]
}

export interface CardAction {
  id: string
  title: string
  data?: Record<string, unknown>
}

export interface CardAnswer {
  cardEventId: string
  actionId: string
  status: SendStatus
}

// Лимиты — зеркало серверных (IncomingContentParser.validateAdaptive), чтобы не ловить
// 400 M_INVALID_PARAM только на моменте нажатия, когда пользователь уже ждёт ответа.
const MAX_BUTTONS = 10
const MAX_TITLE_LENGTH = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isAdaptiveCardPayload(value: unknown): value is AdaptiveCardPayload {
  if (!isRecord(value) || value.type !== 'AdaptiveCard') return false

  // body/actions объявлены массивами в типе, но приезжают из непроверенного wire-объекта
  // (adaptive_card: unknown), а сервер валидирует только длину body. Без этой проверки
  // не-массив доходил бы до toSubmitActions и падал TypeError'ом прямо в фазе рендера,
  // унося всю ленту через корневой ErrorBoundary вместо деградации в текстовый фолбэк.
  return (
    (value.body === undefined || Array.isArray(value.body)) &&
    (value.actions === undefined || Array.isArray(value.actions))
  )
}

// Потолок вложенности: карточка приходит из сети, и глубина Container'ов ничем не ограничена.
const MAX_SCAN_DEPTH = 10

function hasInputElement(body: unknown, depth = 0): boolean {
  if (!Array.isArray(body) || depth > MAX_SCAN_DEPTH) return false

  return body.some((element) => {
    if (!isRecord(element)) return false
    if (typeof element.type === 'string' && element.type.startsWith('Input.')) return true

    // Input.* штатно заворачивают в Container.items и ColumnSet.columns[].items. Без спуска
    // вглубь такая карточка рисуется кнопками без самого поля, и Submit уходит без значений,
    // которые она запрашивала, — бот ветвится по неполным данным.
    return hasInputElement(element.items, depth + 1) || hasInputElement(element.columns, depth + 1)
  })
}

function isValidSubmit(
  action: unknown,
): action is { type: 'Action.Submit'; title: string; id?: unknown; data?: unknown } {
  return (
    isRecord(action) &&
    action.type === 'Action.Submit' &&
    typeof action.title === 'string' &&
    action.title.trim() !== ''
  )
}

/**
 * Единственное место, где карточка сужается до поддерживаемого подмножества (только кнопки).
 * `null` — деградация: карточка требует полей ввода или не содержит валидных Action.Submit,
 * рендер обязан показать текстовый фолбэк (content.body) вместо кнопок.
 */
export function toSubmitActions(card: AdaptiveCardPayload): CardAction[] | null {
  if (hasInputElement(card.body)) return null

  // Array.isArray, а не `?? []`: функция экспортируется, и вызвать её могут с payload'ом,
  // не прошедшим isAdaptiveCardPayload.
  const rawActions = Array.isArray(card.actions) ? card.actions : []
  const validSubmits = rawActions.filter(isValidSubmit).slice(0, MAX_BUTTONS)
  const seenIds = new Set<string>()
  const actions: CardAction[] = []

  for (const [index, action] of validSubmits.entries()) {
    const id =
      typeof action.id === 'string' && action.id.trim() !== '' ? action.id : `submit-${index}`

    if (seenIds.has(id)) continue
    seenIds.add(id)

    const title = action.title.slice(0, MAX_TITLE_LENGTH)

    actions.push({
      id,
      title,
      ...(isRecord(action.data) ? { data: action.data } : {}),
    })
  }

  return actions.length > 0 ? actions : null
}

export function applyCardAnswers(
  existing: Record<string, CardAnswer>,
  incoming: CardAnswer[],
): Record<string, CardAnswer> {
  if (incoming.length === 0) return existing

  let result = existing

  for (const answer of incoming) {
    if (result[answer.cardEventId]?.status === 'sent') continue

    if (result === existing) result = { ...existing }
    result[answer.cardEventId] = answer
  }

  return result
}
