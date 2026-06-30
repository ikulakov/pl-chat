import { describe, expect, it } from 'vitest'
import { mergeMessages } from './helpers'
import type { ChatMessage } from './model'

const base: ChatMessage = {
  localId: '$a',
  eventId: '$a',
  sender: '@op:bank.ru',
  body: 'hi',
  ts: 100,
  pending: false,
  failed: false,
}

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

  it('sync-race: failed message not resolved (only pending=true matches)', () => {
    const failed = { ...base, eventId: 'optimistic:uuid', pending: false, failed: true }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeMessages([failed], [fromSync])

    expect(result).toHaveLength(2)
  })

  it('result is sorted by ts ascending', () => {
    const old = { ...base, eventId: '$old', ts: 50 }
    const newer = { ...base, localId: '$new', eventId: '$new', ts: 200 }

    const result = mergeMessages([newer], [old])

    expect(result[0]!.eventId).toBe('$old')
    expect(result[1]!.eventId).toBe('$new')
  })
})
