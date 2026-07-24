import { describe, expect, it } from 'vitest'
import type { TextTimelineItem } from '../../domain/timeline'
import { t } from '../../i18n'
import { noticeItem, systemItem, textItem } from '../../shared/testUtils/matrixFixtures'
import { getPosition, getQuotePreview, indexMessagesByEventId } from './MessageList.helpers'

function message(sender: string): TextTimelineItem {
  return textItem({ localId: sender, eventId: sender, sender, body: 'x' })
}

describe('getPosition', () => {
  const me = message('@me:bank')
  const op = message('@op:bank')

  it('returns "single" when neither neighbour is from the same sender', () => {
    expect(getPosition(op, me, op)).toBe('single')
  })

  it('returns "single" when there are no neighbours at all', () => {
    expect(getPosition(undefined, me, undefined)).toBe('single')
  })

  it('returns "first" when only the next message shares the sender', () => {
    expect(getPosition(op, me, me)).toBe('first')
  })

  it('returns "middle" when both neighbours share the sender', () => {
    expect(getPosition(me, me, me)).toBe('middle')
  })

  it('returns "last" when only the previous message shares the sender', () => {
    expect(getPosition(me, me, op)).toBe('last')
  })

  it('senderless system-плашка соседом разрывает группировку', () => {
    // плашка (без sender) не должна считаться «тем же отправителем»
    expect(getPosition(systemItem(), me, systemItem())).toBe('single')
  })

  it('m.notice плашка соседом тоже разрывает группировку', () => {
    // notice — плашка от ACD-моста, не bubble; не должна склеивать пузыри вокруг себя
    expect(getPosition(noticeItem(), me, noticeItem())).toBe('single')
  })
})

describe('getQuotePreview', () => {
  const USER = '@me:bank'
  const OPERATOR_NAME = 'Оля'

  function reply(parentEventId: string): TextTimelineItem {
    return {
      ...textItem({ localId: 'r1', eventId: '$r1', sender: USER, body: 'да, подходит' }),
      relation: { type: 'reply', eventId: parentEventId },
    }
  }

  it('цитату отдаёт только для reply-связи', () => {
    const plain = textItem({ eventId: '$plain', sender: USER })

    expect(
      getQuotePreview({
        index: indexMessagesByEventId([plain]),
        message: plain,
        userId: USER,
        operatorName: OPERATOR_NAME,
      }),
    ).toBeUndefined()
  })

  it('родителя вне загруженной ленты показывает заглушкой, без автора', () => {
    // догрузить оригинал нечем — виджет не ходит в точечный GET /event/{id}
    const item = reply('$missing')

    const quote = getQuotePreview({
      index: indexMessagesByEventId([item]),
      message: item,
      userId: USER,
      operatorName: OPERATOR_NAME,
    })

    expect(quote).toEqual({ text: t('chat.reply.unavailable') })
  })

  it('отредактированный родитель (пустой body) — та же заглушка, что и ненайденный', () => {
    // бэкенд при редакции вычищает content: событие в ленте есть, а текста в нём уже нет
    const parent = textItem({ eventId: '$parent', sender: '@op:bank', body: '' })
    const item = reply('$parent')

    const quote = getQuotePreview({
      index: indexMessagesByEventId([parent, item]),
      message: item,
      userId: USER,
      operatorName: OPERATOR_NAME,
    })

    expect(quote).toEqual({ text: t('chat.reply.unavailable') })
  })

  it('загруженный оригинал отдаёт localId как цель скролла', () => {
    // targetId нужен ленте, чтобы найти ряд по data-item-id и подскроллить к нему
    const parent = textItem({
      localId: 'p1',
      eventId: '$parent',
      sender: '@op:bank',
      body: 'вопрос',
    })

    const quote = getQuotePreview({
      index: indexMessagesByEventId([parent, reply('$parent')]),
      message: reply('$parent'),
      userId: USER,
      operatorName: OPERATOR_NAME,
    })

    expect(quote?.targetId).toBe('p1')
  })

  it('недоступный оригинал не несёт цель скролла — цитата будет некликабельной', () => {
    const quote = getQuotePreview({
      index: indexMessagesByEventId([reply('$missing')]),
      message: reply('$missing'),
      userId: USER,
      operatorName: OPERATOR_NAME,
    })

    expect(quote?.targetId).toBeUndefined()
  })

  it('автор цитаты — «Вы» для своего сообщения и имя оператора для чужого', () => {
    const own = textItem({ eventId: '$own', sender: USER, body: 'мой вопрос' })
    const foreign = textItem({ eventId: '$foreign', sender: '@op:bank', body: 'ответ оператора' })
    const index = indexMessagesByEventId([own, foreign])

    expect(
      getQuotePreview({ index, message: reply('$own'), userId: USER, operatorName: OPERATOR_NAME })
        ?.author,
    ).toBe(t('chat.reply.you'))
    expect(
      getQuotePreview({
        index,
        message: reply('$foreign'),
        userId: USER,
        operatorName: OPERATOR_NAME,
      })?.author,
    ).toBe(OPERATOR_NAME)
  })
})
