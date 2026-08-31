import { describe, expect, it } from 'vitest'
import { emojiLayout, splitEmoji, type EmojiIndex } from './emoji'

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

describe('splitEmoji', () => {
  it('режет текст на текстовые и эмодзи-сегменты', () => {
    expect(splitEmoji('Привет 😀 как дела', index)).toEqual([
      { kind: 'text', text: 'Привет ' },
      { kind: 'emoji', char: '😀', codepoint: '1f600' },
      { kind: 'text', text: ' как дела' },
    ])
  })

  it('находит эмодзи с вариационным селектором', () => {
    // В тексте ❤️ приезжает как 2764 fe0f, в паке лежит как 2764.
    expect(splitEmoji('❤️', index)).toEqual([{ kind: 'emoji', char: '❤️', codepoint: '2764' }])
  })

  it('не разваливает ZWJ-последовательность', () => {
    expect(splitEmoji('👩‍⚕️', index)).toEqual([
      { kind: 'emoji', char: '👩‍⚕️', codepoint: '1f469-200d-2695' },
    ])
  })

  it('оставляет текстом эмодзи не из пака', () => {
    expect(splitEmoji('🇷🇺', index)).toEqual([{ kind: 'text', text: '🇷🇺' }])
  })

  it('сохраняет переносы строк', () => {
    expect(splitEmoji('раз\n😀\nдва', index)).toEqual([
      { kind: 'text', text: 'раз\n' },
      { kind: 'emoji', char: '😀', codepoint: '1f600' },
      { kind: 'text', text: '\nдва' },
    ])
  })

  it('без индекса отдаёт один текстовый сегмент', () => {
    expect(splitEmoji('Привет 😀', null)).toEqual([{ kind: 'text', text: 'Привет 😀' }])
  })

  it('на пустом индексе ничего не ищет', () => {
    const empty: EmojiIndex = { version: '', codepointByChar: new Map() }

    expect(splitEmoji('😀', empty)).toEqual([{ kind: 'text', text: '😀' }])
  })

  it('на пустой строке отдаёт пустой список', () => {
    expect(splitEmoji('', index)).toEqual([])
  })
})

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
