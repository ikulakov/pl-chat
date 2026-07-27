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

  it('неподдерживаемый контент молча выпадает, не роняя соседнее валидное сообщение', () => {
    // медиа-msgtype ещё не реализован, m.reaction виджет не рендерит — оба события должны
    // отброситься, но НЕ сорвать маппинг текста между ними (иначе одна картинка гасит всю ленту)
    const mediaMessage = {
      type: MatrixEventType.RoomMessage,
      event_id: '$img',
      sender: OPERATOR_ID,
      origin_server_ts: 1,
      content: { msgtype: 'm.image', body: 'картинка', url: 'mxc://bank.ru/x' },
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
