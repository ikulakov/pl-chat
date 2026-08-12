import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmojiCatalog } from '../../domain/emoji'
import { ensureEmojiCatalog, resetEmojiCatalog } from '../../shared/emoji/emojiCatalogStore'
import { EmojiText } from './EmojiText'

const BITMAP = 'data:image/png;base64,AAA'

const catalog: EmojiCatalog = {
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
  resetEmojiCatalog()
})

describe('EmojiText', () => {
  it('подставляет картинку вместо символа из каталога', async () => {
    ensureEmojiCatalog(() => Promise.resolve(catalog))

    render(<EmojiText text="Привет 😀 как дела" />)

    const image = await screen.findByAltText('😀')
    expect(image).toHaveAttribute('src', BITMAP)
    // Текст вокруг эмодзи остаётся текстом.
    expect(screen.getByText(/Привет/)).toBeInTheDocument()
  })

  it('без каталога отдаёт голый текст', () => {
    const { container } = render(<EmojiText text="Привет 😀" />)

    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('Привет 😀')
  })

  it('эмодзи не из каталога остаётся символом', async () => {
    ensureEmojiCatalog(() => Promise.resolve(catalog))

    render(<EmojiText text="🇷🇺" />)

    // Ждём каталог, чтобы проверка «картинки нет» не сработала до его приезда.
    await screen.findByText('🇷🇺')
    expect(screen.queryByRole('img')).toBeNull()
  })
})
