import { describe, expect, it } from 'vitest'
import { isSystem, type TimelineItem } from '../../domain/timeline'
import {
  OPERATOR_ID,
  operatorJoinedEvent,
  operatorLeftEvent,
  roomMessageEvent,
} from '../../shared/testUtils/matrixFixtures'
import { MatrixEventType, MsgType } from '../wire/consts'
import type { ClientEvent } from '../wire/types'
import { timelineEventsToItems } from './timeline'

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
    // серверный текст едет литералом, а не ключом — переводить его нельзя
    expect(item).toMatchObject({ label: { source: 'literal', body: 'Ищем оператора' } })
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

  it('kc.operator.left с разными reason мапится на разные ключи, kind system', () => {
    const [completed] = timelineEventsToItems([operatorLeftEvent({ reason: 'completed' })])
    const [transferred] = timelineEventsToItems([operatorLeftEvent({ reason: 'transferred' })])
    const [timeout] = timelineEventsToItems([operatorLeftEvent({ reason: 'timeout' })])

    const key = (item?: TimelineItem) =>
      item && isSystem(item) && item.label.source === 'i18n' ? item.label.key : null

    expect(key(completed)).not.toBe(key(transferred))
    expect(key(transferred)).not.toBe(key(timeout))
    expect(completed?.kind).toBe('system')
  })

  it('kc.operator.joined различает human и bot, имя едет параметром', () => {
    const [human] = timelineEventsToItems([
      operatorJoinedEvent({ role: 'human', displayname: 'Оля' }),
    ])
    const [bot] = timelineEventsToItems([operatorJoinedEvent({ role: 'bot' })])

    expect(human).toMatchObject({
      label: { source: 'i18n', key: 'system.operatorJoinedHuman', params: { name: 'Оля' } },
    })
    expect(bot).toMatchObject({ label: { source: 'i18n', key: 'system.operatorJoinedBot' } })
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

  it('kc.adaptive.v1 с валидным payload даёт kind: adaptiveCard, card едет целиком', () => {
    const card = {
      type: 'AdaptiveCard',
      version: '1.5',
      actions: [{ type: 'Action.Submit', id: 'confirm', title: 'Подтвердить' }],
    }
    const [item] = timelineEventsToItems([
      roomMessageEvent({
        content: { msgtype: MsgType.AdaptiveCard, body: 'Карточка', adaptive_card: card },
      }),
    ])

    expect(item).toMatchObject({ kind: 'adaptiveCard', content: { body: 'Карточка', card } })
  })

  it('kc.adaptive.v1 с card_kind сохраняет его для гейта CSI (T-61)', () => {
    const [item] = timelineEventsToItems([
      roomMessageEvent({
        content: {
          msgtype: MsgType.AdaptiveCard,
          body: 'Анкета',
          card_kind: 'csi',
          adaptive_card: { type: 'AdaptiveCard' },
        },
      }),
    ])

    expect(item).toMatchObject({ content: { cardKind: 'csi' } })
  })

  it('kc.adaptive.v1 с битым payload деградирует в текст, а не пропадает', () => {
    const [item] = timelineEventsToItems([
      roomMessageEvent({
        content: {
          msgtype: MsgType.AdaptiveCard,
          body: 'Карточка',
          adaptive_card: { type: 'NotACard' },
        },
      }),
    ])

    expect(item).toMatchObject({ kind: 'text', content: { body: 'Карточка' } })
  })

  it('kc.adaptive.action не даёт элемент ленты — ответ клиента виден по подсветке кнопки, не пузырём', () => {
    const items = timelineEventsToItems([
      roomMessageEvent({
        content: {
          msgtype: MsgType.AdaptiveAction,
          body: '[action: confirm]',
          adaptive_action: { action_id: 'confirm', source_event_id: '$card' },
        },
      }),
    ])

    expect(items).toEqual([])
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
