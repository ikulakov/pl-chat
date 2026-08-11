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
  return isRecord(value) && value.type === 'AdaptiveCard'
}

function hasInputElement(body: unknown[] | undefined): boolean {
  if (!body) return false

  return body.some(
    (element) =>
      isRecord(element) && typeof element.type === 'string' && element.type.startsWith('Input.'),
  )
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

  const validSubmits = (card.actions ?? []).filter(isValidSubmit).slice(0, MAX_BUTTONS)
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
