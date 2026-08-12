import { describe, expect, it } from 'vitest'
import { applyMediaVerdicts } from './mediaVerdict'

describe('mergeMediaVerdicts', () => {
  it('добавляет новые вердикты по mediaId', () => {
    const result = applyMediaVerdicts({}, [
      { mediaId: 'm1', verdict: { status: 'ready' } },
      { mediaId: 'm2', verdict: { status: 'rejected' } },
    ])

    expect(result).toEqual({
      m1: { status: 'ready' },
      m2: { status: 'rejected' },
    })
  })

  it('не перезаписывает уже известный вердикт — он терминален', () => {
    const existing = { m1: { status: 'ready' as const } }

    const result = applyMediaVerdicts(existing, [
      { mediaId: 'm1', verdict: { status: 'rejected' } },
    ])

    expect(result).toBe(existing)
  })

  it('пустой список входящих не создаёт новый объект', () => {
    const existing = {}

    expect(applyMediaVerdicts(existing, [])).toBe(existing)
  })
})
