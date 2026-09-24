import type { EmojiIndex } from '@/domain/emoji'
import { ensureEmojiIndex, resetEmojiIndex } from '../../../Emoji/cache/emojiIndexStore'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TextContent } from './TextContent'

const BITMAP = 'data:image/png;base64,AAA'

const index: EmojiIndex = {
  version: 'mock-1',
  codepointByChar: new Map([['😀', '1f600']]),
}

vi.mock<unknown>(import('@/hooks/useChatActions'), () => {
  const actions = { loadEmojiAnimation: () => Promise.resolve({}) }
  return { useChatActions: () => actions }
})

vi.mock(import('../../../Emoji/lottie/emojiBitmap'), () => ({
  getEmojiBitmap: () => Promise.resolve(BITMAP),
}))

beforeEach(() => {
  resetEmojiIndex()
})

describe('TextContent', () => {
  it('заменяет эмодзи и в подписи ссылки — она такой же текст сообщения', async () => {
    ensureEmojiIndex(() => Promise.resolve(index))

    render(
      <TextContent
        text='<a href="https://bank.ru">Оплатить 😀</a>'
        // ссылки разбираются только у собеседника
        isOwn={false}
      />,
    )

    const image = await screen.findByAltText('😀')
    expect(image.closest('a')).toHaveAttribute('href', 'https://bank.ru')
  })
})
