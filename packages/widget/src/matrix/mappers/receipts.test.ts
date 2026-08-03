import { describe, expect, it } from 'vitest'
import { readReceipt, receiptEvent } from '../../shared/testUtils/matrixFixtures'
import type { EphemeralEvent } from '../types'
import { toReadMarkers } from './receipts'

const OPERATOR = '@operator:bank'

describe('toReadMarkers', () => {
  it('разворачивает m.read в пары userId → eventId', () => {
    expect(toReadMarkers([readReceipt('$m1', OPERATOR, 10)])).toEqual([
      { userId: OPERATOR, eventId: '$m1' },
    ])
  })

  it('игнорирует не-receipt ephemeral-события (m.typing и пр.)', () => {
    const typing: EphemeralEvent = {
      type: 'm.typing',
      content: { user_ids: [OPERATOR] },
    }

    expect(toReadMarkers([typing])).toEqual([])
  })

  it('игнорирует receipt без m.read', () => {
    expect(toReadMarkers([receiptEvent({ $m1: {} })])).toEqual([])
  })
})
