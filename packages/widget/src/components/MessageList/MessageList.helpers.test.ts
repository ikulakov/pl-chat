import { describe, expect, it } from 'vitest'
import type { FileTimelineItem, TextTimelineItem } from '../../domain/timeline'
import { t } from '../../i18n'
import { noticeItem, systemItem, textItem } from '../../shared/testUtils/matrixFixtures'
import { getPosition, getReplyPreview, indexMessagesByEventId } from './MessageList.helpers'

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

describe('getReplyPreview', () => {
  const USER = '@me:bank'
  const OPERATOR = '@op:bank'

  function reply(parentEventId: string): TextTimelineItem {
    return {
      ...textItem({ localId: 'r1', eventId: '$r1', sender: USER, body: 'да, подходит' }),
      relation: { type: 'reply', eventId: parentEventId },
    }
  }

  it('цитату отдаёт только для reply-связи', () => {
    const plain = textItem({ eventId: '$plain', sender: USER })

    expect(
      getReplyPreview({
        index: indexMessagesByEventId([plain]),
        message: plain,
        userId: USER,
      }),
    ).toBeUndefined()
  })

  it('родителя вне загруженной ленты показывает заглушкой, без автора', () => {
    // догрузить оригинал нечем — виджет не ходит в точечный GET /event/{id}
    const item = reply('$missing')

    const preview = getReplyPreview({
      index: indexMessagesByEventId([item]),
      message: item,
      userId: USER,
    })

    expect(preview).toEqual({ text: t('chat.reply.unavailable') })
  })

  it('отредактированный родитель (пустой body) — та же заглушка, что и ненайденный', () => {
    // бэкенд при редакции вычищает content: событие в ленте есть, а текста в нём уже нет
    const parent = textItem({ eventId: '$parent', sender: '@op:bank', body: '' })
    const item = reply('$parent')

    const preview = getReplyPreview({
      index: indexMessagesByEventId([parent, item]),
      message: item,
      userId: USER,
    })

    expect(preview).toEqual({ text: t('chat.reply.unavailable') })
  })

  it('цитата на файл без подписи показывает имя файла, а не заглушку «недоступно»', () => {
    // у медиа body — только подпись (см. eventMapping.createMediaItem), и без неё он пуст;
    // цитировать при этом есть что — сам файл загружен и лежит в ленте
    const parent: FileTimelineItem = {
      kind: 'file',
      localId: 'p1',
      eventId: '$parent',
      sender: OPERATOR,
      ts: 0,
      sendStatus: 'sent',
      content: {
        body: '',
        url: 'mxc://bank.ru/abc',
        filename: 'doc.pdf',
        info: { mimetype: 'application/pdf', size: 100 },
      },
    }

    const preview = getReplyPreview({
      index: indexMessagesByEventId([parent, reply('$parent')]),
      message: reply('$parent'),
      userId: USER,
    })

    expect(preview).toEqual({
      author: t('chat.reply.operator'),
      text: 'doc.pdf',
      targetId: 'p1',
    })
  })

  it('загруженный оригинал отдаёт localId как цель скролла', () => {
    // targetId нужен ленте, чтобы найти ряд по data-item-id и подскроллить к нему
    const parent = textItem({
      localId: 'p1',
      eventId: '$parent',
      sender: '@op:bank',
      body: 'вопрос',
    })

    const preview = getReplyPreview({
      index: indexMessagesByEventId([parent, reply('$parent')]),
      message: reply('$parent'),
      userId: USER,
    })

    expect(preview?.targetId).toBe('p1')
  })

  it('недоступный оригинал не несёт цель скролла — цитата будет некликабельной', () => {
    const preview = getReplyPreview({
      index: indexMessagesByEventId([reply('$missing')]),
      message: reply('$missing'),
      userId: USER,
    })

    expect(preview?.targetId).toBeUndefined()
  })

  it('автор цитаты — «Вы» для своего сообщения и «Оператор» для чужого', () => {
    const own = textItem({ eventId: '$own', sender: USER, body: 'мой вопрос' })
    const foreign = textItem({ eventId: '$foreign', sender: OPERATOR, body: 'ответ оператора' })
    const index = indexMessagesByEventId([own, foreign])

    expect(
      getReplyPreview({
        index,
        message: reply('$own'),
        userId: USER,
      })?.author,
    ).toBe(t('chat.reply.you'))
    expect(
      getReplyPreview({
        index,
        message: reply('$foreign'),
        userId: USER,
      })?.author,
    ).toBe(t('chat.reply.operator'))
  })

  it('автор цитаты от другого оператора — тоже нейтральный оператор', () => {
    const oldOperatorMessage = textItem({
      eventId: '$old',
      sender: '@old-op:bank',
      body: 'старый ответ',
    })
    const index = indexMessagesByEventId([oldOperatorMessage])

    expect(
      getReplyPreview({
        index,
        message: reply('$old'),
        userId: USER,
      })?.author,
    ).toBe(t('chat.reply.operator'))
  })
})
