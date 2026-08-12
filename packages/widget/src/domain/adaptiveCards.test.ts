import { describe, expect, it } from 'vitest'
import {
  applyCardAnswers,
  isAdaptiveCardPayload,
  toSubmitActions,
  type AdaptiveCardPayload,
  type CardAnswer,
} from './adaptiveCards'

const BUTTONS_CARD: AdaptiveCardPayload = {
  type: 'AdaptiveCard',
  version: '1.5',
  body: [{ type: 'TextBlock', text: 'Подтвердите' }],
  actions: [
    { type: 'Action.Submit', id: 'confirm', title: 'Подтвердить', data: { action: 'confirm' } },
    { type: 'Action.Submit', id: 'cancel', title: 'Отменить' },
  ],
}

describe('isAdaptiveCardPayload', () => {
  it('признаёт объект с type: AdaptiveCard', () => {
    expect(isAdaptiveCardPayload(BUTTONS_CARD)).toBe(true)
  })

  it('отбрасывает null, массивы и объекты без type', () => {
    expect(isAdaptiveCardPayload(null)).toBe(false)
    expect(isAdaptiveCardPayload([])).toBe(false)
    expect(isAdaptiveCardPayload({ version: '1.5' })).toBe(false)
    expect(isAdaptiveCardPayload({ type: 'NotAdaptiveCard' })).toBe(false)
  })
})

describe('toSubmitActions — правило деградации', () => {
  it('карточка только с кнопками даёт список Action.Submit', () => {
    const actions = toSubmitActions(BUTTONS_CARD)

    expect(actions).toEqual([
      { id: 'confirm', title: 'Подтвердить', data: { action: 'confirm' } },
      { id: 'cancel', title: 'Отменить' },
    ])
  })

  it('любой Input.* в body — деградация в null, даже если кнопки валидны', () => {
    const card: AdaptiveCardPayload = {
      ...BUTTONS_CARD,
      body: [{ type: 'Input.Text', id: 'code', label: 'Кодовое слово' }],
    }

    expect(toSubmitActions(card)).toBeNull()
  })

  it('Action.OpenUrl не попадает в результат — не Action.Submit', () => {
    const card: AdaptiveCardPayload = {
      type: 'AdaptiveCard',
      actions: [{ type: 'Action.OpenUrl', title: 'Открыть', url: 'https://bank.ru' }],
    }

    expect(toSubmitActions(card)).toBeNull()
  })

  it('Submit без title отбрасывается, с title без id получает детерминированный фолбэк', () => {
    const card: AdaptiveCardPayload = {
      type: 'AdaptiveCard',
      actions: [
        { type: 'Action.Submit', title: '' },
        { type: 'Action.Submit', title: 'Продолжить' },
      ],
    }

    // фолбэк-id детерминирован по индексу среди валидных действий — не пустая строка,
    // иначе adaptive_action.action_id уйдёт пустым и бэкенд ответит 400 M_INVALID_PARAM
    expect(toSubmitActions(card)).toEqual([{ id: 'submit-0', title: 'Продолжить' }])
  })

  it('карточка без валидных Action.Submit — null', () => {
    const card: AdaptiveCardPayload = { type: 'AdaptiveCard', actions: [] }

    expect(toSubmitActions(card)).toBeNull()
  })

  it('дубли id — побеждает первая кнопка, вторая отбрасывается (иначе обе подсвечивались бы выбранными)', () => {
    const card: AdaptiveCardPayload = {
      type: 'AdaptiveCard',
      actions: [
        { type: 'Action.Submit', id: 'dup', title: 'Первая' },
        { type: 'Action.Submit', id: 'dup', title: 'Вторая' },
      ],
    }

    expect(toSubmitActions(card)).toEqual([{ id: 'dup', title: 'Первая' }])
  })
})

describe('applyCardAnswers — монотонный мердж', () => {
  it('подтверждённый (sent) ответ не откатывается повторным приходом того же события', () => {
    const existing: Record<string, CardAnswer> = {
      $card: { cardEventId: '$card', actionId: 'confirm', status: 'sent' },
    }
    const incoming: CardAnswer[] = [{ cardEventId: '$card', actionId: 'confirm', status: 'sent' }]

    const result = applyCardAnswers(existing, incoming)

    expect(result.$card).toEqual(existing.$card)
    expect(result).toBe(existing) // пустой мердж — та же ссылка, не лишний ререндер
  })

  it('новый ответ добавляется без потери существующих', () => {
    const existing: Record<string, CardAnswer> = {
      $card1: { cardEventId: '$card1', actionId: 'confirm', status: 'sent' },
    }
    const incoming: CardAnswer[] = [{ cardEventId: '$card2', actionId: 'edit', status: 'sent' }]

    const result = applyCardAnswers(existing, incoming)

    expect(result.$card1).toEqual(existing.$card1)
    expect(result.$card2).toEqual({ cardEventId: '$card2', actionId: 'edit', status: 'sent' })
  })

  it('пустой incoming возвращает ту же ссылку', () => {
    const existing: Record<string, CardAnswer> = {}

    expect(applyCardAnswers(existing, [])).toBe(existing)
  })

  it('два sent на одну карточку в одном батче — побеждает первый, независимо от разбивки на батчи', () => {
    const first: CardAnswer = { cardEventId: '$card', actionId: 'a', status: 'sent' }
    const second: CardAnswer = { cardEventId: '$card', actionId: 'b', status: 'sent' }

    const inOneBatch = applyCardAnswers({}, [first, second])
    const inTwoBatches = applyCardAnswers(applyCardAnswers({}, [first]), [second])

    expect(inOneBatch.$card).toEqual(first)
    expect(inTwoBatches.$card).toEqual(first)
  })
})
