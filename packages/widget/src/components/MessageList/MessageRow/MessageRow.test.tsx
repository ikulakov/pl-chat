import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmojiIndex } from '../../../domain/emoji'
import type { MessageTimelineItem } from '../../../domain/timeline'
import { LONG_PRESS_MS } from '../../../hooks/useMessageGestures'
import { t } from '../../../i18n'
import { ensureEmojiIndex, resetEmojiIndex } from '../../../shared/emoji/emojiIndexStore'
import { textItem } from '../../../shared/testUtils/matrixFixtures'
import { TestPointerEvent, touch } from '../../../shared/testUtils/pointer'
import { MessageRow } from './MessageRow'

const BUBBLE = '[data-role="message-bubble"]'

const index: EmojiIndex = {
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
  return renderMessage(textItem({ body }), replyText)
}

function renderMessage(message: MessageTimelineItem, replyText?: string) {
  return render(
    <MessageRow
      message={message}
      userId="@me:bank"
      position="single"
      readByOperator={false}
      reactions={undefined}
      replyAuthor={replyText ? 'Оля' : undefined}
      replyText={replyText}
      replySticker={undefined}
      replyTargetId={undefined}
      onReplyClick={vi.fn()}
    />,
  )
}

beforeEach(() => {
  resetEmojiIndex()
  ensureEmojiIndex(() => Promise.resolve(index))
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

describe('MessageRow: долгое нажатие', () => {
  const ROW = '[data-item-id]'

  beforeEach(() => {
    vi.stubGlobal('PointerEvent', TestPointerEvent)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function longPress(row: Element) {
    fireEvent.pointerDown(row, { ...touch, clientX: 200, clientY: 100 })
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    fireEvent.pointerUp(row, touch)
  }

  const triggerIn = (row: HTMLElement) =>
    within(row).getByRole('button', { name: t('chat.action.menu') })

  // Само поднятие делает CSS (:has на атрибутах триггера) — jsdom его не считает, поэтому
  // проверяем признаки, по которым оно срабатывает.
  it('долгое нажатие открывает меню с подложкой — признак, по которому ряд поднимается', () => {
    const { container } = renderMessage(textItem({ body: 'вопрос' }))
    const row = container.querySelector<HTMLElement>(ROW)!

    longPress(row)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(triggerIn(row)).toHaveAttribute('data-backdrop')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(triggerIn(row)).not.toHaveAttribute('data-backdrop')
  })

  it('не открывает меню долгим нажатием, если в нём нечего показать', () => {
    // без текста нечего копировать и цитировать, повтор — только у своего упавшего
    const { container } = renderMessage(textItem({ body: '  ' }))
    const row = container.querySelector<HTMLElement>(ROW)!

    longPress(row)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(triggerIn(row)).not.toHaveAttribute('data-popup-open')
  })

  it('открытие кнопкой «…» обходится без подложки — ряд не поднимается', () => {
    const { container } = renderMessage(textItem({ body: 'вопрос' }))
    const row = container.querySelector<HTMLElement>(ROW)!

    fireEvent.click(triggerIn(row))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(triggerIn(row)).toHaveAttribute('data-popup-open')
    expect(triggerIn(row)).not.toHaveAttribute('data-backdrop')
  })
})
