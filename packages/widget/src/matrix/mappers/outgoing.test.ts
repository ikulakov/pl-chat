import { describe, expect, it } from 'vitest'
import type { MediaTimelineItem, MessageTimelineItem } from '../../domain/timeline'
import { fileItem, imageItem, stickerItem, textItem } from '../../shared/testUtils/matrixFixtures'
import { outgoingEventType, toMessageContent } from './outgoing'

// Сборка тела события — единственное место перевода домена в wire на исходящем направлении.
// Раньше это проверялось сквозь фальшивый транспорт в matrixApi.test.ts.

function withReply<T extends MessageTimelineItem>(item: T, eventId: string): T {
  return { ...item, relation: { type: 'reply', eventId } }
}

describe('toMessageContent', () => {
  it('текст едет как m.text с телом сообщения', () => {
    expect(toMessageContent(textItem({ body: 'привет' }))).toEqual({
      msgtype: 'm.text',
      body: 'привет',
    })
  })

  it('reply кладёт m.relates_to.m.in_reply_to и не пишет fallback в body', () => {
    expect(toMessageContent(withReply(textItem({ body: 'ок' }), '$parent:bank'))).toEqual({
      msgtype: 'm.text',
      body: 'ок',
      'm.relates_to': { 'm.in_reply_to': { event_id: '$parent:bank' } },
    })
  })

  it('kind домена превращается в msgtype провода', () => {
    expect(toMessageContent(imageItem())).toMatchObject({ msgtype: 'm.image' })
    expect(toMessageContent(fileItem())).toMatchObject({ msgtype: 'm.file' })
  })

  it('стикер уходит как {body, info, url} — без msgtype', () => {
    const content = toMessageContent(stickerItem())

    expect(content).toEqual({
      body: '🩷',
      url: 'mxc://bank.ru/AbCdEfGhIjKlMnOpQrStUvWx',
      info: { mimetype: 'image/webp', size: 4096, w: 512, h: 512 },
    })
  })

  it('у стикера не бывает цитаты: связь не прикрепляется даже при relation в элементе', () => {
    // Поля `m.relates_to` нет в RoomStickerContentDto, а FAIL_ON_UNKNOWN_PROPERTIES выключен —
    // сервер молча выбросил бы связь. Не отправляем её вовсе, чтобы расхождение не пряталось.
    const withReply = stickerItem({ relation: { type: 'reply', eventId: '$parent:bank' } })

    expect(toMessageContent(withReply)).not.toHaveProperty('m.relates_to')
  })

  it('тип события считается из элемента: стикер — m.sticker, остальное — m.room.message', () => {
    expect(outgoingEventType(stickerItem())).toBe('m.sticker')
    expect(outgoingEventType(textItem())).toBe('m.room.message')
    expect(outgoingEventType(imageItem())).toBe('m.room.message')
  })

  it('без подписи body на проводе падает на filename (MSC2530)', () => {
    // домен держит подпись и имя файла раздельно (body пуст без подписи), но на проводе
    // body не бывает пустым — иначе клиенты без media-рендерера покажут пустое сообщение
    const content = toMessageContent(imageItem({ body: '', content: { filename: 'p.png' } }))

    expect(content).toMatchObject({ msgtype: 'm.image', body: 'p.png', filename: 'p.png' })
  })

  it('подпись переживает перевод, reply у медиа едет тем же m.relates_to', () => {
    const item = withReply(
      fileItem({ body: 'смотри договор', content: { filename: 'doc.pdf' } }),
      '$parent:bank',
    )

    expect(toMessageContent(item)).toMatchObject({
      msgtype: 'm.file',
      body: 'смотри договор',
      'm.relates_to': { 'm.in_reply_to': { event_id: '$parent:bank' } },
    })
  })

  it('локальные поля доменной модели не утекают в payload', () => {
    // у черновика в upload лежит объект File; спред отправил бы на провод и его,
    // и любое будущее локальное поле (превью, статус проверки)
    const draft = {
      ...fileItem({ body: '', content: { filename: 'doc.pdf' } }),
      upload: { file: new File(['x'], 'doc.pdf'), pct: 42 },
    } as MediaTimelineItem

    expect(toMessageContent(draft)).toEqual({
      msgtype: 'm.file',
      body: 'doc.pdf',
      url: 'mxc://bank.ru/abc',
      filename: 'doc.pdf',
      info: { mimetype: 'application/pdf', size: 100 },
    })
  })
})
