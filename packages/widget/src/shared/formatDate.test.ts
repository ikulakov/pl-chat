import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDateLabel } from './formatDate'

describe('formatDateLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // "сейчас" — середина дня, чтобы граничные случаи ниже были показательны
    vi.setSystemTime(new Date('2026-07-02T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Сегодня" for a timestamp on the same calendar day, even at a different hour', () => {
    expect(formatDateLabel(new Date('2026-07-02T00:05:00').getTime())).toBe('Сегодня')
  })

  it('returns "Вчера" for a timestamp on the previous calendar day, even if less than 24h haven\'t passed', () => {
    expect(formatDateLabel(new Date('2026-07-01T23:55:00').getTime())).toBe('Вчера')
  })

  it('does not leak "Вчера" onto a timestamp exactly 48h in the past', () => {
    expect(formatDateLabel(new Date('2026-06-30T12:00:00').getTime())).not.toBe('Вчера')
  })

  it('includes the year for a timestamp from a previous year', () => {
    expect(formatDateLabel(new Date('2025-03-10T12:00:00').getTime())).toBe('10 марта 2025 г.')
  })

  it('omits the year for a timestamp from the current year', () => {
    expect(formatDateLabel(new Date('2026-03-10T12:00:00').getTime())).not.toContain('2026')
  })
})
