import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmojiCatalog } from '../../../domain/emoji'
import { ensureEmojiCatalog, resetEmojiCatalog } from '../../../shared/emoji/emojiCatalogStore'
import { textItem } from '../../../shared/testUtils/matrixFixtures'
import { MessageRow } from './MessageRow'

const BUBBLE = '[data-role="message-bubble"]'

const catalog: EmojiCatalog = {
  version: 'mock-1',
  codepointByChar: new Map([
    ['😀', '1f600'],
    ['😋', '1f60b'],
    ['❤', '2764'],
  ]),
}

vi.mock('../../../hooks/useChatActions', () => {
  const actions = {
    resendMessage: vi.fn(),
    replyTo: vi.fn(),
    loadEmojiAnimation: () => Promise.resolve({}),
  }
  return { useChatActions: () => actions }
})

vi.mock('../../../shared/lottie/emojiBitmap', () => ({
  getEmojiBitmap: () => Promise.resolve('data:image/png;base64,AAA'),
}))

function renderRow(body: string, replyText?: string) {
  return render(
    <MessageRow
      message={textItem({ body })}
      userId="@me:bank"
      position="single"
      readByOperator={false}
      replyAuthor={replyText ? 'Оля' : undefined}
      replyText={replyText}
      replyTargetId={undefined}
      onReplyClick={vi.fn()}
    />,
  )
}

beforeEach(() => {
  resetEmojiCatalog()
  ensureEmojiCatalog(() => Promise.resolve(catalog))
})

describe('MessageRow: сообщение из одних эмодзи', () => {
  it('одно эмодзи рисует крупно и без плашки бабла', async () => {
    const { container } = renderRow('😋')

    await waitFor(() => expect(container.querySelector(BUBBLE)).toBeNull())
    expect(screen.getByRole('img', { name: '😋' })).toBeInTheDocument()
  })

  it('три эмодзи тоже рисует без плашки', async () => {
    const { container } = renderRow('😋😀❤️')

    await waitFor(() => expect(container.querySelector(BUBBLE)).toBeNull())
    expect(screen.getAllByRole('img')).toHaveLength(3)
  })

  it('четыре эмодзи возвращают обычный бабл со строчными', async () => {
    const { container } = renderRow('😋😀❤️😋')

    await screen.findAllByAltText('😋')
    expect(container.querySelector(BUBBLE)).not.toBeNull()
  })

  it('эмодзи вместе с текстом остаются в бабле', async () => {
    const { container } = renderRow('да 😋')

    await screen.findByAltText('😋')
    expect(container.querySelector(BUBBLE)).not.toBeNull()
  })

  it('сообщение с цитатой остаётся баблом: цитату не на чем показать', async () => {
    const { container } = renderRow('😋', 'исходное сообщение')

    await screen.findByAltText('😋')
    expect(container.querySelector(BUBBLE)).not.toBeNull()
  })
})
