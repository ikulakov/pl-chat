import { describe, expect, it } from 'vitest'
import { emojiLayout, splitEmoji, type EmojiCatalog } from './emoji'

// Пак хранит символы без вариационного селектора — как их отдаёт сервер.
const catalog: EmojiCatalog = {
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
    expect(splitEmoji('Привет 😀 как дела', catalog)).toEqual([
      { kind: 'text', text: 'Привет ' },
      { kind: 'emoji', char: '😀', codepoint: '1f600' },
      { kind: 'text', text: ' как дела' },
    ])
  })

  it('находит эмодзи с вариационным селектором', () => {
    // В тексте ❤️ приезжает как 2764 fe0f, в паке лежит как 2764.
    expect(splitEmoji('❤️', catalog)).toEqual([{ kind: 'emoji', char: '❤️', codepoint: '2764' }])
  })

  it('не разваливает ZWJ-последовательность', () => {
    expect(splitEmoji('👩‍⚕️', catalog)).toEqual([
      { kind: 'emoji', char: '👩‍⚕️', codepoint: '1f469-200d-2695' },
    ])
  })

  it('оставляет текстом эмодзи не из пака', () => {
    expect(splitEmoji('🇷🇺', catalog)).toEqual([{ kind: 'text', text: '🇷🇺' }])
  })

  it('сохраняет переносы строк', () => {
    expect(splitEmoji('раз\n😀\nдва', catalog)).toEqual([
      { kind: 'text', text: 'раз\n' },
      { kind: 'emoji', char: '😀', codepoint: '1f600' },
      { kind: 'text', text: '\nдва' },
    ])
  })

  it('без каталога отдаёт один текстовый сегмент', () => {
    expect(splitEmoji('Привет 😀', null)).toEqual([{ kind: 'text', text: 'Привет 😀' }])
  })

  it('на пустом каталоге ничего не ищет', () => {
    const empty: EmojiCatalog = { version: '', codepointByChar: new Map() }

    expect(splitEmoji('😀', empty)).toEqual([{ kind: 'text', text: '😀' }])
  })

  it('на пустой строке отдаёт пустой список', () => {
    expect(splitEmoji('', catalog)).toEqual([])
  })
})

describe('emojiLayout', () => {
  it('одно эмодзи без текста — большое', () => {
    expect(emojiLayout(splitEmoji('😋', catalog))).toBe('big')
  })

  it('два-три эмодзи без текста — средние', () => {
    expect(emojiLayout(splitEmoji('😋😀', catalog))).toBe('mid')
    expect(emojiLayout(splitEmoji('😋 😀 ❤️', catalog))).toBe('mid')
  })

  it('четыре и больше — строчные', () => {
    expect(emojiLayout(splitEmoji('😋😀❤️😋', catalog))).toBe('inline')
  })

  it('эмодзи вместе с текстом — строчные', () => {
    expect(emojiLayout(splitEmoji('да 😋', catalog))).toBe('inline')
  })

  it('текст без эмодзи — строчный', () => {
    expect(emojiLayout(splitEmoji('просто текст', catalog))).toBe('inline')
  })
})
