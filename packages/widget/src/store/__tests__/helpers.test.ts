import { describe, expect, it } from 'vitest'
import { chatMessage, roomMessageEvent } from '../../shared/testUtils/matrixFixtures'
import { mergeMessages, mergeTimelineEvents } from '../helpers'

const base = chatMessage({
  localId: '$a',
  eventId: '$a',
  sender: '@op:bank.ru',
  body: 'hi',
  ts: 100,
})

describe('mergeMessages — deduplication invariants', () => {
  it('appends message with unknown eventId', () => {
    const incoming = { ...base, localId: '$b', eventId: '$b', ts: 200 }

    const result = mergeMessages([base], [incoming])

    expect(result).toHaveLength(2)
  })

  it('deduplicates: same eventId not added twice', () => {
    const result = mergeMessages([base], [base])

    expect(result).toHaveLength(1)
  })

  it('sync-race: pending message with matching sender+body resolved, no duplicate', () => {
    const pending = { ...base, eventId: 'optimistic:uuid', pending: true }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeMessages([pending], [fromSync])

    expect(result).toHaveLength(1)
    expect(result[0]!.eventId).toBe('$real')
    expect(result[0]!.pending).toBe(false)
  })

  it('sync-race: duplicate pending messages with the same body resolve only one draft', () => {
    const first = { ...base, localId: 'local-1', eventId: 'optimistic:1', pending: true }
    const second = { ...base, localId: 'local-2', eventId: 'optimistic:2', pending: true, ts: 101 }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeMessages([first, second], [fromSync])

    expect(result).toHaveLength(2)
    expect(result.filter((message) => message.eventId === '$real')).toHaveLength(1)
    expect(result.filter((message) => message.pending)).toHaveLength(1)
  })

  it('sync-race: при одинаковом теле реальный event достаётся ПЕРВОМУ черновику (known txnId-less gap)', () => {
    // матч идёт по sender+body, не по unsigned.transaction_id → если сервер создал событие
    // для второго черновика, а sync принёс его раньше ответа PUT первого, resolved окажется
    // первый. Пиним поведение: будущий матч по txnId должен изменить его осознанно.
    const first = { ...base, localId: 'local-1', eventId: 'optimistic:1', pending: true, ts: 100 }
    const second = { ...base, localId: 'local-2', eventId: 'optimistic:2', pending: true, ts: 101 }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeMessages([first, second], [fromSync])

    expect(result.find((message) => message.eventId === '$real')?.localId).toBe('local-1')
  })

  it('sync-race: failed message not resolved (only pending=true matches)', () => {
    const failed = { ...base, eventId: 'optimistic:uuid', pending: false, failed: true }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeMessages([failed], [fromSync])

    expect(result).toHaveLength(2)
  })

  it('returns the same array reference when nothing actually changes (empty or fully-duplicate incoming)', () => {
    // критично для React: если ссылка на messages меняется на каждый пустой тик sync-петли,
    // любой useEffect/подписка с зависимостью [messages] будет срабатывать без реальных изменений
    const existing = [base]

    expect(mergeMessages(existing, [])).toBe(existing)
    expect(mergeMessages(existing, [base])).toBe(existing)
  })
})

describe('mergeTimelineEvents — reference stability', () => {
  it('returns the same array reference when there are no new events', () => {
    const existing = [roomMessageEvent()]

    expect(mergeTimelineEvents(existing, [])).toBe(existing)
    expect(mergeTimelineEvents(existing, [roomMessageEvent()])).toBe(existing)
  })

  it('returns a new array when a genuinely new event arrives', () => {
    const existing = [roomMessageEvent({ event_id: '$m1' })]
    const incoming = [roomMessageEvent({ event_id: '$m2' })]

    const result = mergeTimelineEvents(existing, incoming)

    expect(result).not.toBe(existing)
    expect(result).toHaveLength(2)
  })
})
