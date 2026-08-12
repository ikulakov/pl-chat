import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmojiIndex } from '../../domain/emoji'
import { ensureEmojiIndex, resetEmojiIndex } from '../../shared/emoji/emojiIndexStore'
import { EmojiText } from './EmojiText'

const BITMAP = 'data:image/png;base64,AAA'

const index: EmojiIndex = {
  version: 'mock-1',
  codepointByChar: new Map([['😀', '1f600']]),
}

// Байты анимации берутся через ChatActions — их подменяем; сам кадр рисовать нечем (jsdom).
vi.mock('../../hooks/useChatActions', () => {
  const actions = { loadEmojiAnimation: () => Promise.resolve({}) }
  return { useChatActions: () => actions }
})

vi.mock('../../shared/lottie/emojiBitmap', () => ({
  getEmojiBitmap: () => Promise.resolve(BITMAP),
}))

beforeEach(() => {
  resetEmojiIndex()
})

describe('EmojiText', () => {
  it('подставляет картинку вместо символа из пака', async () => {
    ensureEmojiIndex(() => Promise.resolve(index))

    render(<EmojiText text="Привет 😀 как дела" />)

    const image = await screen.findByAltText('😀')
    expect(image).toHaveAttribute('src', BITMAP)
    // Текст вокруг эмодзи остаётся текстом.
    expect(screen.getByText(/Привет/)).toBeInTheDocument()
  })

  it('без индекса отдаёт голый текст', () => {
    const { container } = render(<EmojiText text="Привет 😀" />)

    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('Привет 😀')
  })

  it('эмодзи не из пака остаётся символом', async () => {
    ensureEmojiIndex(() => Promise.resolve(index))

    render(<EmojiText text="🇷🇺" />)

    // Ждём индекс, чтобы проверка «картинки нет» не сработала до его приезда.
    await screen.findByText('🇷🇺')
    expect(screen.queryByRole('img')).toBeNull()
  })
})
