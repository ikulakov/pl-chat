import { describe, expect, it } from 'vitest'
import { isEnvelope, makeEnvelope } from '../envelope'
import { MAX_MESSAGE_BYTES, withinSizeLimit } from '../policy'
import { HOST_COMMAND_TYPES, isHostCommand } from '../protocol'

describe('isEnvelope', () => {
  it('accepts a valid envelope', () => {
    expect(isEnvelope(makeEnvelope({ type: 'READY' }))).toBe(true)
  })

  it('rejects wrong namespace', () => {
    const e = makeEnvelope({ type: 'READY' })
    expect(isEnvelope({ ...e, ns: '__other' })).toBe(false)
  })

  it('rejects null msg', () => {
    const e = makeEnvelope({ type: 'READY' })
    expect(isEnvelope({ ...e, msg: null })).toBe(false)
  })

  it('rejects missing id', () => {
    const { id: _, ...rest } = makeEnvelope({ type: 'READY' })
    expect(isEnvelope(rest)).toBe(false)
  })

  it('rejects null', () => {
    expect(isEnvelope(null)).toBe(false)
  })

  it('rejects primitive', () => {
    expect(isEnvelope('string')).toBe(false)
    expect(isEnvelope(42)).toBe(false)
  })
})

describe('isHostCommand', () => {
  it('accepts every declared command type (catches union/array drift)', () => {
    for (const type of HOST_COMMAND_TYPES) {
      expect(isHostCommand({ type })).toBe(true)
    }
  })

  it('rejects an unknown type', () => {
    expect(isHostCommand({ type: 'NOT_A_REAL_COMMAND' })).toBe(false)
  })
})

describe('withinSizeLimit', () => {
  it('accepts small message', () => {
    expect(withinSizeLimit({ type: 'OPEN' })).toBe(true)
  })
  it('rejects message over limit', () => {
    expect(withinSizeLimit({ data: 'x'.repeat(MAX_MESSAGE_BYTES) })).toBe(false)
  })
})
