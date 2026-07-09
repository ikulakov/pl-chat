import { describe, expect, it } from 'vitest'
import { chatMessage } from '../../shared/testUtils/matrixFixtures'
import type { ChatMessage } from '../../store/model'
import { deriveMessageStatus, getPosition } from './MessageList.helpers'

function message(sender: string): ChatMessage {
  return chatMessage({ localId: sender, eventId: sender, sender, body: 'x' })
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

describe('deriveMessageStatus', () => {
  const base = message('@me:bank')

  it('returns "failed" for a failed message, regardless of pending', () => {
    expect(deriveMessageStatus({ ...base, failed: true, pending: true })).toBe('failed')
    expect(deriveMessageStatus({ ...base, failed: true, pending: false })).toBe('failed')
  })

  it('returns "sending" for a pending, non-failed message', () => {
    expect(deriveMessageStatus({ ...base, pending: true, failed: false })).toBe('sending')
  })

  it('returns "sent" when neither pending nor failed', () => {
    expect(deriveMessageStatus({ ...base, pending: false, failed: false })).toBe('sent')
  })
})
