import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../store/model'
import { getPosition } from './MessageList.helpers'

function message(sender: string): ChatMessage {
  return {
    localId: sender,
    eventId: sender,
    sender,
    body: 'x',
    ts: 0,
    pending: false,
    failed: false,
  }
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
})
