import { ChatController } from '../../../chatController'
import type { EmojiIndex } from '@/domain/emoji'
import type { MessageTimelineItem } from '@/domain/timeline'
import { LONG_PRESS_MS } from '../hooks/useMessageGestures'
import { t } from '@/i18n'
import { formatTime } from '@/shared/utils/formatTime'
import { ensureEmojiIndex, resetEmojiIndex } from '../../Emoji/cache/emojiIndexStore'
import { fileItem, imageItem, stickerItem, textItem } from '@/shared/testUtils/matrixFixtures'
import { chatStore } from '@/store/store'
import { INITIAL_RUNTIME_STATE } from '@/store/initialState'
import { TestPointerEvent, touch } from '@/shared/testUtils/pointer'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageRow } from './MessageRow'

const controller = new ChatController({ setCommandHandler: vi.fn(), send: vi.fn() })

const BUBBLE = '[data-testid="message-bubble"]'

const index: EmojiIndex = {
  version: 'mock-1',
  codepointByChar: new Map([
    ['😀', '1f600'],
    ['😋', '1f60b'],
    ['❤', '2764'],
  ]),
}

const toggleReaction = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock<unknown>(import('@/hooks/useChatActions'), () => {
  const actions = {
    resendMessage: vi.fn(),
    toggleReaction,
    loadEmojiAnimation: () => Promise.resolve({}),
    // превью картинки не приезжает: кадр остаётся скелетоном, в сеть тест не ходит
    loadPreview: () => new Promise(() => {}),
  }
  return { useChatActions: () => ({ ...controller.actions, ...actions }) }
})

vi.mock(import('../../Emoji/lottie/emojiBitmap'), () => ({
  getEmojiBitmap: () => Promise.resolve('data:image/png;base64,AAA'),
}))

function renderRow(body: string, replyText?: string) {
  return renderMessage(textItem({ body }), replyText)
}

function renderMessage(message: MessageTimelineItem, replyText?: string) {
  return render(messageRow(message, replyText))
}

function messageRow(message: MessageTimelineItem, replyText?: string) {
  const replyParent = replyText ? textItem({ eventId: '$parent', body: replyText }) : undefined
  return (
    <MessageRow
      message={
        replyParent
          ? { ...message, relation: { type: 'reply', eventId: replyParent.eventId } }
          : message
      }
      userId="@me:bank"
      position="single"
      readByOperator={false}
      replyParent={replyParent}
      onReplyNavigate={vi.fn()}
    />
  )
}

beforeEach(() => {
  chatStore.setState(INITIAL_RUNTIME_STATE)
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

  it.each(['😋', '😋😀❤️'])(
    'сохраняет крупные эмодзи "%s" при добавлении и снятии реакции',
    async (body) => {
      const { container } = renderRow(body)
      await screen.findByRole('img', { name: '😋' })
      const emojis = screen.getAllByRole('img')

      act(() => {
        chatStore.getState().dispatch({
          type: 'reaction.added',
          targetEventId: 'm1',
          entry: { eventId: '$reaction', sender: '@me:bank', key: '👍' },
        })
      })

      expect(container.querySelector(BUBBLE)).toBeNull()
      for (const emoji of emojis) {
        expect(screen.getByRole('img', { name: emoji.getAttribute('aria-label')! })).toBe(emoji)
      }
      const reaction = screen.getByRole('button', {
        name: t('chat.reaction.count', { emoji: '👍', count: 1 }),
      })
      expect(reaction).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(reaction)
      expect(toggleReaction).toHaveBeenLastCalledWith('m1', '👍')

      act(() => {
        chatStore.getState().dispatch({ type: 'reaction.removed', eventId: '$reaction' })
      })

      expect(reaction).not.toBeInTheDocument()
      expect(container.querySelector(BUBBLE)).toBeNull()
      for (const emoji of emojis) expect(emoji).toBeInTheDocument()
    },
  )

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

  it.each(['@me:bank', '@operator:bank'])(
    'эмодзи с цитатой остаётся крупным и без пузыря (автор %s)',
    async (sender) => {
      const { container } = renderMessage(textItem({ body: '😋', sender }), 'исходное сообщение')

      const emoji = await screen.findByRole('img', { name: '😋' })
      expect(emoji).toHaveStyle({ width: '102px', height: '102px' })
      expect(container.querySelector(BUBBLE)).toBeNull()
      expect(screen.getByTestId('reply-preview')).toHaveTextContent('исходное сообщение')
      expect(screen.getByRole('button', { name: t('chat.reply.goToOriginal') })).toBeEnabled()
    },
  )

  it('стикер с цитатой остаётся без пузыря и сохраняет свой размер', () => {
    const { container } = renderMessage(stickerItem(), 'исходное сообщение')

    expect(screen.getByRole('img', { name: '🩷' })).toHaveStyle({ width: '185px', height: '185px' })
    expect(container.querySelector(BUBBLE)).toBeNull()
    expect(screen.getByTestId('reply-preview')).toHaveTextContent('исходное сообщение')
  })
})

describe('MessageRow: подпись к вложению', () => {
  it.each([
    ['картинки', imageItem],
    ['файла', fileItem],
  ] as const)(
    'ссылка в подписи %s кликабельна у оператора и остаётся текстом у своего',
    (_, createItem) => {
      const body = 'подробнее на https://bank.ru/help'
      const { rerender } = renderMessage(createItem({ body }))
      expect(screen.getByRole('link', { name: 'https://bank.ru/help' })).toHaveAttribute(
        'href',
        'https://bank.ru/help',
      )

      rerender(messageRow(createItem({ body, sender: '@me:bank' })))
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      expect(screen.getByText(body)).toBeInTheDocument()
    },
  )

  it.each<[string, string | undefined]>([
    ['без цитаты', undefined],
    ['с цитатой', 'исходное сообщение'],
  ])(
    'подпись картинки стоит в пузыре над кадром (%s), время — пилюлей на кадре',
    (_, replyText) => {
      const message = imageItem({ body: 'смотрите скриншот' })
      renderMessage(message, replyText)

      const caption = screen.getByText('смотрите скриншот')
      // span времени → пилюля MessageMeta → рамка кадра
      const frame = screen.getByText(formatTime(message.ts)).parentElement!.parentElement!

      expect(frame).not.toContainElement(caption)
      expect(caption.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      if (replyText) {
        expect(caption.closest('p')!.parentElement).toContainElement(
          screen.getByTestId('reply-preview'),
        )
      }
    },
  )
})

describe('MessageRow: долгое нажатие', () => {
  beforeEach(() => {
    chatStore.setState(INITIAL_RUNTIME_STATE)
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

  it('свайп выбирает сообщение для ответа', () => {
    const message = textItem({ eventId: '$reply', body: 'вопрос' })
    renderMessage(message)
    const row = screen.getByTestId('message-row')

    fireEvent.pointerDown(row, { ...touch, clientX: 200, clientY: 100 })
    fireEvent.pointerMove(row, { ...touch, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(row, touch)

    expect(chatStore.getState().room.replyTarget).toEqual({
      eventId: message.eventId,
      sender: message.sender,
      quote: { kind: 'text', text: 'вопрос' },
    })
  })

  // Само поднятие делает CSS (:has на атрибутах триггера) — jsdom его не считает, поэтому
  // проверяем признаки, по которым оно срабатывает.
  it('долгое нажатие открывает меню с подложкой — признак, по которому ряд поднимается', () => {
    renderMessage(textItem({ body: 'вопрос' }))
    const row = screen.getByTestId('message-row')

    longPress(row)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(triggerIn(row)).toHaveAttribute('data-backdrop')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(triggerIn(row)).not.toHaveAttribute('data-backdrop')
  })

  it('не открывает меню долгим нажатием, если в нём нечего показать', () => {
    // без текста нечего копировать и цитировать, повтор — только у своего упавшего
    renderMessage(textItem({ eventId: 'optimistic:empty', body: '  ' }))
    const row = screen.getByTestId('message-row')

    longPress(row)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(triggerIn(row)).not.toHaveAttribute('data-popup-open')
  })

  it('открытие кнопкой «…» обходится без подложки — ряд не поднимается', () => {
    renderMessage(textItem({ body: 'вопрос' }))
    const row = screen.getByTestId('message-row')

    fireEvent.click(triggerIn(row))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(triggerIn(row)).toHaveAttribute('data-popup-open')
    expect(triggerIn(row)).not.toHaveAttribute('data-backdrop')
  })
})

describe('MessageRow: ответ через меню', () => {
  it('прячет «Ответить» у сообщения с оптимистичным eventId — иначе на бэкенд уедет висячий указатель', () => {
    renderMessage(textItem({ eventId: 'optimistic:m1', sender: '@user:bank', body: 'hello' }))

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.queryByText(t('chat.action.reply'))).not.toBeInTheDocument()
  })

  it('прячет «Ответить» у сообщения с пустым body — очищенное/недоступное, цитата на него бессмысленна', () => {
    renderMessage(textItem({ eventId: '$m1', sender: '@operator:bank', body: '   ' }))

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.queryByText(t('chat.action.reply'))).not.toBeInTheDocument()
  })

  it('«Ответить» у отправленного сообщения передаёт цель ответа целиком (eventId, автор, текст)', () => {
    renderMessage(textItem({ eventId: '$m1', sender: '@operator:bank', body: 'hello' }))

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    fireEvent.click(screen.getByText(t('chat.action.reply')))

    expect(chatStore.getState().room.replyTarget).toEqual({
      eventId: '$m1',
      sender: '@operator:bank',
      quote: { kind: 'text', text: 'hello' },
    })
  })

  it('показывает «Ответить» у файла даже без подписи — сам файл уже контент для цитаты', () => {
    renderMessage(fileItem())

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.getByText(t('chat.action.reply'))).toBeInTheDocument()
  })

  it('«Ответить» у файла без подписи кладёт в превью цитаты имя файла, а не пустую строку', () => {
    renderMessage(fileItem())

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    fireEvent.click(screen.getByText(t('chat.action.reply')))

    expect(chatStore.getState().room.replyTarget).toEqual({
      eventId: '$m1',
      sender: '@operator:bank',
      quote: { kind: 'text', text: 'doc.pdf' },
    })
  })

  it('«Ответить» у файла с подписью кладёт в превью саму подпись, не имя файла', () => {
    renderMessage(fileItem({ body: 'договор на подпись' }))

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    fireEvent.click(screen.getByText(t('chat.action.reply')))

    expect(chatStore.getState().room.replyTarget).toEqual({
      eventId: '$m1',
      sender: '@operator:bank',
      quote: { kind: 'text', text: 'договор на подпись' },
    })
  })
})

describe('MessageRow: реакции', () => {
  afterEach(() => toggleReaction.mockClear())

  it.each(['', 'договор на подпись'])(
    'размещает реакции файла и единственное время в общем футере (подпись: "%s")',
    (body) => {
      const message = fileItem({ body })
      renderMessage(message)
      const time = formatTime(message.ts)
      const download = screen.getByRole('button', {
        name: t('chat.media.download', { name: 'doc.pdf' }),
      })
      const originalMetaParent = screen.getByText(time).parentElement!.parentElement!

      act(() => {
        chatStore.getState().dispatch({
          type: 'reaction.added',
          targetEventId: message.eventId,
          entry: { eventId: '$own', sender: '@me:bank', key: '👍' },
        })
      })

      const bar = screen.getByTestId('reaction-bar')
      expect(screen.getAllByText(time)).toHaveLength(1)
      expect(bar.parentElement).toContainElement(screen.getByText(time))
      expect(originalMetaParent).not.toContainElement(screen.getByText(time))
      expect(download).not.toContainElement(bar)
      if (body) expect(screen.getByText(body)).toBeInTheDocument()

      fireEvent.click(within(bar).getByRole('button'))
      expect(toggleReaction).toHaveBeenCalledExactlyOnceWith(message.eventId, '👍')

      act(() => {
        chatStore.getState().dispatch({ type: 'reaction.removed', eventId: '$own' })
      })
      expect(screen.queryByTestId('reaction-bar')).not.toBeInTheDocument()
      expect(screen.getAllByText(time)).toHaveLength(1)
      expect(originalMetaParent).toContainElement(screen.getByText(time))
    },
  )

  function openReactionPicker() {
    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
  }

  it('передаёт выбранную реакцию и актуальное сообщение в операцию отправки', () => {
    const { rerender } = renderMessage(textItem({ eventId: '$target', body: 'вопрос' }))
    openReactionPicker()
    fireEvent.click(screen.getByRole('button', { name: t('chat.reaction.add', { emoji: '👍' }) }))
    expect(toggleReaction).toHaveBeenCalledExactlyOnceWith('$target', '👍')

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('chat.action.menu') })).toHaveFocus()
    rerender(messageRow(textItem({ eventId: '$other', body: 'другой вопрос' })))
    openReactionPicker()
    fireEvent.click(screen.getByRole('button', { name: t('chat.reaction.add', { emoji: '👍' }) }))
    expect(toggleReaction).toHaveBeenLastCalledWith('$other', '👍')
  })

  it('помечает свою реакцию в пикере и панели и снимает тем же действием', () => {
    chatStore.getState().dispatch({
      type: 'reaction.added',
      targetEventId: '$message',
      entry: { eventId: '$own', sender: '@me:bank', key: '👍' },
    })
    renderMessage(textItem({ eventId: '$message' }))
    openReactionPicker()
    const remove = screen.getByRole('button', { name: t('chat.reaction.remove', { emoji: '👍' }) })
    const chip = screen.getByRole('button', {
      name: t('chat.reaction.count', { emoji: '👍', count: 1 }),
    })
    expect(remove).toHaveAttribute('aria-pressed', 'true')
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(remove)
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('chat.action.menu') })).toHaveFocus()
    fireEvent.click(chip)
    expect(toggleReaction.mock.calls).toEqual([
      ['$message', '👍'],
      ['$message', '👍'],
    ])
  })

  it('не предлагает реакции для сообщения без серверного id', () => {
    renderMessage(textItem({ eventId: 'optimistic:local' }))
    openReactionPicker()
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(toggleReaction).not.toHaveBeenCalled()
  })

  it('переключает быстрые реакции стрелками, Home и End', () => {
    renderMessage(textItem())
    openReactionPicker()
    const toolbar = screen.getByRole('toolbar')
    const buttons = within(toolbar).getAllByRole('button')
    buttons[0]!.focus()
    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' })
    expect(buttons.at(-1)).toHaveFocus()
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' })
    expect(buttons[0]).toHaveFocus()
    fireEvent.keyDown(toolbar, { key: 'End' })
    expect(buttons.at(-1)).toHaveFocus()
    fireEvent.keyDown(toolbar, { key: 'Home' })
    expect(buttons[0]).toHaveFocus()
  })
})
