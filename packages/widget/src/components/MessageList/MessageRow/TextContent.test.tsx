import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmojiIndex } from '../../../domain/emoji'
import { ensureEmojiIndex, resetEmojiIndex } from '../../../shared/emoji/emojiIndexStore'
import type { BubbleMetaData } from './BubbleMeta'
import { TextContent } from './TextContent'

const BITMAP = 'data:image/png;base64,AAA'

const index: EmojiIndex = {
  version: 'mock-1',
  codepointByChar: new Map([['😀', '1f600']]),
}

vi.mock('../../../hooks/useChatActions', () => {
  const actions = { loadEmojiAnimation: () => Promise.resolve({}) }
  return { useChatActions: () => actions }
})

vi.mock('../../../shared/lottie/emojiBitmap', () => ({
  getEmojiBitmap: () => Promise.resolve(BITMAP),
}))

// Ссылки разбираются только у собеседника — own: false обязателен для этого теста.
const META: BubbleMetaData = {
  ts: new Date('2026-07-01T10:00:00').getTime(),
  own: false,
  sendStatus: 'sent',
  isRead: false,
}

beforeEach(() => {
  resetEmojiIndex()
})

describe('TextContent', () => {
  it('заменяет эмодзи и в подписи ссылки — она такой же текст сообщения', async () => {
    ensureEmojiIndex(() => Promise.resolve(index))

    render(
      <TextContent
        text='<a href="https://bank.ru">Оплатить 😀</a>'
        meta={META}
      />,
    )

    const image = await screen.findByAltText('😀')
    expect(image.closest('a')).toHaveAttribute('href', 'https://bank.ru')
  })
})
