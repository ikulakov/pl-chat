import { describe, expect, it } from 'vitest'
import { noticeItem, systemItem, textItem } from '../../shared/testUtils/matrixFixtures'
import type { TextTimelineItem } from '../../domain/timeline'
import { getPosition } from './MessageList.helpers'

function message(sender: string): TextTimelineItem {
  return textItem({ localId: sender, eventId: sender, sender, body: 'x' })
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

  it('senderless system-плашка соседом разрывает группировку', () => {
    // плашка (без sender) не должна считаться «тем же отправителем»
    expect(getPosition(systemItem(), me, systemItem())).toBe('single')
  })

  it('m.notice плашка соседом тоже разрывает группировку', () => {
    // notice — плашка от ACD-моста, не bubble; не должна склеивать пузыри вокруг себя
    expect(getPosition(noticeItem(), me, noticeItem())).toBe('single')
  })
})
