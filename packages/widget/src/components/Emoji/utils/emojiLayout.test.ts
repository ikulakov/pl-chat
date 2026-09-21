import { splitEmoji, type EmojiIndex } from '@/domain/emoji'
import { describe, expect, it } from 'vitest'
import { emojiLayout } from './emojiLayout'

// Пак хранит символы без вариационного селектора — как их отдаёт сервер.
const index: EmojiIndex = {
  version: '2026-08-12',
  codepointByChar: new Map([
    ['😀', '1f600'],
    ['😋', '1f60b'],
    ['❤', '2764'],
    ['👩‍⚕', '1f469-200d-2695'],
  ]),
}

describe('emojiLayout', () => {
  it('одно эмодзи без текста — большое', () => {
    expect(emojiLayout(splitEmoji('😋', index))).toBe('big')
  })

  it('два-три эмодзи без текста — средние', () => {
    expect(emojiLayout(splitEmoji('😋😀', index))).toBe('mid')
    expect(emojiLayout(splitEmoji('😋 😀 ❤️', index))).toBe('mid')
  })

  it('четыре и больше — строчные', () => {
    expect(emojiLayout(splitEmoji('😋😀❤️😋', index))).toBe('inline')
  })

  it('эмодзи вместе с текстом — строчные', () => {
    expect(emojiLayout(splitEmoji('да 😋', index))).toBe('inline')
  })

  it('текст без эмодзи — строчный', () => {
    expect(emojiLayout(splitEmoji('просто текст', index))).toBe('inline')
  })
})
