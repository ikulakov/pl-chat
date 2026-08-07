import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '../../i18n'
import { formatSize } from './formatSize'

describe('formatSize', () => {
  afterEach(() => {
    setLocale('ru')
  })

  it('picks the unit by threshold and rounds the fraction to one decimal', () => {
    expect(formatSize(500)).toBe('500 Б')
    expect(formatSize(1536)).toBe('1.5 КБ')
    expect(formatSize(1024 * 1024 * 2.25)).toBe('2.3 МБ')
  })

  it('treats undefined and negative sizes as unknown', () => {
    expect(formatSize(undefined)).toBe('—')
    expect(formatSize(-1)).toBe('—')
  })

  it('switches the unit label with the active locale', () => {
    setLocale('en')

    expect(formatSize(500)).toBe('500 B')
    expect(formatSize(1536)).toBe('1.5 KB')
  })
})
