import type { TextTimelineItem } from '@/domain/timeline'
import { t } from '@/i18n'
import { fileItem, stickerItem, textItem } from '@/shared/testUtils/matrixFixtures'
import { describe, expect, it } from 'vitest'
import { getMessageReplyPreview } from './ReplyPreview.helpers'

describe('getMessageReplyPreview', () => {
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
      getMessageReplyPreview({
        parent: undefined,
        message: plain,
        userId: USER,
      }),
    ).toBeUndefined()
  })

  it('родителя вне загруженной ленты показывает заглушкой, без автора', () => {
    // догрузить оригинал нечем — виджет не ходит в точечный GET /event/{id}
    const item = reply('$missing')

    const preview = getMessageReplyPreview({
      parent: undefined,
      message: item,
      userId: USER,
    })

    expect(preview).toEqual({ text: t('chat.reply.unavailable') })
  })

  it('отредактированный родитель (пустой body) — та же заглушка, что и ненайденный', () => {
    // бэкенд при редакции вычищает content: событие в ленте есть, а текста в нём уже нет
    const parent = textItem({ eventId: '$parent', sender: '@op:bank', body: '' })
    const item = reply('$parent')

    const preview = getMessageReplyPreview({
      parent,
      message: item,
      userId: USER,
    })

    expect(preview).toEqual({ text: t('chat.reply.unavailable') })
  })

  it('цитата на файл без подписи показывает имя файла, а не заглушку «недоступно»', () => {
    // у медиа body — только подпись (см. eventMapping.createMediaItem), и без неё он пуст;
    // цитировать при этом есть что — сам файл загружен и лежит в ленте
    const parent = fileItem({ localId: 'p1', eventId: '$parent', sender: OPERATOR, ts: 0 })

    const preview = getMessageReplyPreview({
      parent,
      message: reply('$parent'),
      userId: USER,
    })

    expect(preview).toEqual({
      author: t('chat.reply.operator'),
      text: 'doc.pdf',
      targetId: 'p1',
    })
  })

  it('цитата на стикер — подпись «Стикер» и сам стикер, а не его эмодзи', () => {
    const parent = stickerItem({ localId: 'p1', eventId: '$parent', body: '🐥' })

    const preview = getMessageReplyPreview({
      parent,
      message: reply('$parent'),
      userId: USER,
    })

    expect(preview).toEqual({
      author: t('chat.reply.operator'),
      text: t('chat.reply.sticker'),
      targetId: 'p1',
      sticker: {
        mediaId: 'AbCdEfGhIjKlMnOpQrStUvWx',
        body: '🐥',
        format: 'image',
        bytesUrl: '/_matrix/sticker/AbCdEfGhIjKlMnOpQrStUvWx',
      },
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

    const preview = getMessageReplyPreview({
      parent,
      message: reply('$parent'),
      userId: USER,
    })

    expect(preview?.targetId).toBe('p1')
  })

  it('недоступный оригинал не несёт цель скролла — цитата будет некликабельной', () => {
    const preview = getMessageReplyPreview({
      parent: undefined,
      message: reply('$missing'),
      userId: USER,
    })

    expect(preview?.targetId).toBeUndefined()
  })

  it('автор цитаты — «Вы» для своего сообщения и «Оператор» для чужого', () => {
    const own = textItem({ eventId: '$own', sender: USER, body: 'мой вопрос' })
    const foreign = textItem({ eventId: '$foreign', sender: OPERATOR, body: 'ответ оператора' })

    expect(
      getMessageReplyPreview({
        parent: own,
        message: reply('$own'),
        userId: USER,
      })?.author,
    ).toBe(t('chat.reply.you'))
    expect(
      getMessageReplyPreview({
        parent: foreign,
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

    expect(
      getMessageReplyPreview({
        parent: oldOperatorMessage,
        message: reply('$old'),
        userId: USER,
      })?.author,
    ).toBe(t('chat.reply.operator'))
  })
})
