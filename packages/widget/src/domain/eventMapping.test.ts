import { describe, expect, it } from 'vitest'
import { MsgType } from '../matrix/consts'
import {
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
})
