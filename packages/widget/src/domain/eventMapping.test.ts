import { describe, expect, it } from 'vitest'
import { MatrixEventType, MsgType } from '../matrix/consts'
import type { ClientEvent } from '../matrix/types'
import {
  OPERATOR_ID,
  operatorJoinedEvent,
  operatorLeftEvent,
  roomMessageEvent,
} from '../shared/testUtils/matrixFixtures'
import { timelineEventsToItems } from './eventMapping'

describe('timelineEventsToItems — варианты контента', () => {
  it('обычный m.text даёт kind: text', () => {
    const [item] = timelineEventsToItems([roomMessageEvent()])

    expect(item?.kind).toBe('text')
  })

  it('m.notice даёт kind: notice (плашка)', () => {
    const [item] = timelineEventsToItems([
      roomMessageEvent({ content: { msgtype: MsgType.Notice, body: 'Ищем оператора' } }),
    ])

    expect(item?.kind).toBe('notice')
    expect(item?.content.body).toBe('Ищем оператора')
  })

  it('m.relates_to → m.in_reply_to даёт relation reply, без него поля нет', () => {
    const [reply] = timelineEventsToItems([
      roomMessageEvent({
        content: {
          msgtype: MsgType.Text,
          body: 'да, подходит',
          'm.relates_to': { 'm.in_reply_to': { event_id: '$parent' } },
        },
      }),
    ])
    const [plain] = timelineEventsToItems([roomMessageEvent()])

    expect(reply).toMatchObject({ relation: { type: 'reply', eventId: '$parent' } })
    // отсутствие ключа, а не undefined — страховка от регрессии по exactOptionalPropertyTypes
    expect(plain).not.toHaveProperty('relation')
  })

  it('kc.operator.left с разными reason мапится на разный текст, kind system', () => {
    const [completed] = timelineEventsToItems([operatorLeftEvent({ reason: 'completed' })])
    const [transferred] = timelineEventsToItems([operatorLeftEvent({ reason: 'transferred' })])
    const [timeout] = timelineEventsToItems([operatorLeftEvent({ reason: 'timeout' })])

    expect(completed?.content.body).not.toBe(transferred?.content.body)
    expect(transferred?.content.body).not.toBe(timeout?.content.body)
    expect(completed?.kind).toBe('system')
  })

  it('kc.operator.joined различает human и bot', () => {
    const [human] = timelineEventsToItems([
      operatorJoinedEvent({ role: 'human', displayname: 'Оля' }),
    ])
    const [bot] = timelineEventsToItems([operatorJoinedEvent({ role: 'bot' })])

    expect(human?.content.body).not.toBe(bot?.content.body)
    expect(human?.content.body).toContain('Оля')
  })

  it('m.file без подписи (body === filename на wire) даёт пустой body в домене', () => {
    const [item] = timelineEventsToItems([
      roomMessageEvent({
        content: {
          msgtype: MsgType.File,
          body: 'doc.pdf',
          filename: 'doc.pdf',
          url: 'mxc://bank.ru/abc',
          info: { mimetype: 'application/pdf', size: 100 },
        },
      }),
    ])

    expect(item).toMatchObject({
      kind: 'file',
      content: { body: '', filename: 'doc.pdf' },
    })
  })

  it('m.image с реальной подписью (body !== filename) сохраняет её в домене', () => {
    const [item] = timelineEventsToItems([
      roomMessageEvent({
        content: {
          msgtype: MsgType.Image,
          body: 'отчёт за март',
          filename: 'report.png',
          url: 'mxc://bank.ru/abc',
          info: { mimetype: 'image/png', size: 200 },
        },
      }),
    ])

    expect(item).toMatchObject({
      kind: 'image',
      content: { body: 'отчёт за март', filename: 'report.png' },
    })
  })

  it('медиа с цитатой сохраняет связь: иначе echo из sync стирает её у своего же черновика', () => {
    const [item] = timelineEventsToItems([
      roomMessageEvent({
        content: {
          msgtype: MsgType.Image,
          body: 'отчёт',
          filename: 'report.png',
          url: 'mxc://bank.ru/abc',
          info: { mimetype: 'image/png', size: 200 },
          'm.relates_to': { 'm.in_reply_to': { event_id: '$parent' } },
        },
      }),
    ])

    expect(item).toMatchObject({
      kind: 'image',
      relation: { type: 'reply', eventId: '$parent' },
    })
  })

  it('m.file без explicit filename (не обязателен по спеке) берёт его из body, caption пуст', () => {
    const [item] = timelineEventsToItems([
      roomMessageEvent({
        content: {
          msgtype: MsgType.File,
          body: 'doc.pdf',
          url: 'mxc://bank.ru/abc',
          info: { mimetype: 'application/pdf', size: 100 },
        },
      }),
    ])

    expect(item).toMatchObject({
      kind: 'file',
      content: { body: '', filename: 'doc.pdf' },
    })
  })

  it('неподдерживаемый контент молча выпадает, не роняя соседнее валидное сообщение', () => {
    // m.audio ещё не реализован (только text/image/file), m.reaction виджет не рендерит —
    // оба события должны отброситься, но НЕ сорвать маппинг текста между ними
    const mediaMessage = {
      type: MatrixEventType.RoomMessage,
      event_id: '$audio',
      sender: OPERATOR_ID,
      origin_server_ts: 1,
      content: { msgtype: 'm.audio', body: 'запись', url: 'mxc://bank.ru/x' },
    } as unknown as ClientEvent
    const reaction = {
      type: 'm.reaction',
      event_id: '$react',
      sender: OPERATOR_ID,
      origin_server_ts: 3,
      content: {},
    } as unknown as ClientEvent

    const items = timelineEventsToItems([
      mediaMessage,
      roomMessageEvent({ event_id: '$txt', content: { body: 'текст' } }),
      reaction,
    ])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'text', content: { body: 'текст' } })
  })
})
