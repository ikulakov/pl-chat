import { INITIAL_RUNTIME_STATE } from '@/store/initialState'
import { t } from '@/i18n'
import { fileItem, textItem } from '@/shared/testUtils/matrixFixtures'
import { CopyFilledIcon } from '@/shared/ui/icons'
import { chatStore } from '@/store/store'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageActions } from './MessageActions'
import { ReactionPicker } from './reactions/ReactionPicker'

const resendMessage = vi.fn()
const replyTo = vi.fn()
const showToast = vi.hoisted(() => vi.fn())

vi.mock<unknown>(import('@/hooks/useChatActions'), () => ({
  useChatActions: () => ({ resendMessage, replyTo }),
}))

vi.mock(import('@/shared/ui/Toast'), () => ({ showToast }))

describe('MessageActions', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    chatStore.getState().setViewport('docked')
    resendMessage.mockClear()
    replyTo.mockClear()
    chatStore.setState(INITIAL_RUNTIME_STATE)
    showToast.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Открытие меню/закрытие по внешнему клику — механика Dropdown, покрыта в Dropdown.test.tsx.
  // Здесь тестируем только то, что MessageActions строит поверх Dropdown: пункты и их действия.

  it('выбирает текущее сообщение для ответа', () => {
    render(
      <MessageActions
        message={textItem()}
        isOwn={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    fireEvent.click(screen.getByText(t('chat.action.reply')))

    expect(replyTo).toHaveBeenCalledExactlyOnceWith({
      eventId: 'm1',
      sender: '@operator:bank',
      quote: { kind: 'text', text: 'hello' },
    })
  })

  it('скрывает пункт ответа у оптимистичного сообщения', () => {
    render(
      <MessageActions
        message={textItem({ eventId: 'optimistic:m1' })}
        isOwn={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryByText(t('chat.action.reply'))).not.toBeInTheDocument()
  })

  it('copies the message body to the clipboard when "Копировать" is clicked', async () => {
    render(
      <MessageActions
        message={textItem({ eventId: '$m1', sender: '@operator:bank', body: 'hello world' })}
        isOwn={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    fireEvent.click(screen.getByText(t('chat.action.copy')))

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world'))
    expect(showToast).not.toHaveBeenCalled()
  })

  it('shows a copied toast after copying in the mobile fullscreen viewport', async () => {
    chatStore.getState().setViewport('fullscreen')
    render(
      <MessageActions
        message={textItem({ eventId: '$m1', sender: '@operator:bank', body: 'hello world' })}
        isOwn={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    fireEvent.click(screen.getByText(t('chat.action.copy')))

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledExactlyOnceWith(t('chat.action.copied'), {
        icon: CopyFilledIcon,
      }),
    )
  })

  it('a real tap on "Копировать" (pointerdown → click) is not swallowed by the outside-close handler', async () => {
    render(
      <MessageActions
        message={textItem({ eventId: '$m1', sender: '@operator:bank', body: 'hello world' })}
        isOwn={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    const item = screen.getByText(t('chat.action.copy'))

    // на реальном устройстве click предваряется pointerdown/pointerup по тому же элементу —
    // документный pointerdown-хендлер не должен закрыть меню раньше, чем долетит click
    fireEvent.pointerDown(item)
    fireEvent.pointerUp(item)
    fireEvent.click(item)

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world'))
  })

  it('shows "Повторить" only for own failed message, and invokes resendMessage with the message localId', () => {
    render(
      <MessageActions
        message={textItem({
          localId: 'm1',
          eventId: '$m1',
          sender: '@user:bank',
          sendStatus: 'failed',
        })}
        isOwn={true}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    fireEvent.click(screen.getByText(t('chat.action.retry')))

    expect(resendMessage).toHaveBeenCalledExactlyOnceWith('m1')
  })

  it('прячет «Копировать» у файла без подписи — копировать нечего, body пуст', () => {
    render(
      <MessageActions
        message={fileItem()}
        isOwn={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.queryByText(t('chat.action.copy'))).not.toBeInTheDocument()
  })

  it('показывает «Копировать» у файла с реальной подписью (body отличается от filename)', async () => {
    render(
      <MessageActions
        message={fileItem({ body: 'договор на подпись' })}
        isOwn={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    fireEvent.click(screen.getByText(t('chat.action.copy')))

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('договор на подпись'),
    )
  })

  // Повтор должен предлагаться ровно в одном месте: у сорвавшейся заливки он живёт в самом
  // чипе (там же видна причина и есть «Удалить»), у сорвавшегося /send — в этом меню.
  it('у медиа отдаёт повтор чипу, если упала заливка байт, и оставляет себе — если упал /send', () => {
    const { rerender } = render(
      <MessageActions
        message={fileItem({
          localId: 'm1',
          sendStatus: 'failed',
          upload: { file: new File([], 'doc.pdf'), pct: null, error: 'network' },
        })}
        isOwn={true}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    expect(screen.queryByText(t('chat.action.retry'))).not.toBeInTheDocument()

    // байты доехали, упал сам /send — upload снят редьюсером, повтор снова за меню
    rerender(
      <MessageActions
        message={fileItem({ localId: 'm1', sendStatus: 'failed' })}
        isOwn={true}
      />,
    )

    expect(screen.getByText(t('chat.action.retry'))).toBeInTheDocument()
  })

  it.each(['hello', ''])(
    'показывает переданный пикер и обрабатывает выбор при body="%s"',
    (body) => {
      const onToggleReaction = vi.fn()
      render(
        <MessageActions
          reactionPicker={
            <ReactionPicker
              summaries={[]}
              onToggle={onToggleReaction}
            />
          }
          message={textItem({ body })}
          isOwn={false}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
      expect(screen.getByRole('toolbar')).toBeInTheDocument()
      if (body) {
        expect(screen.getByText(t('chat.action.reply'))).toBeInTheDocument()
        expect(screen.getByText(t('chat.action.copy'))).toBeInTheDocument()
      } else {
        expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
      }
      fireEvent.click(screen.getByRole('button', { name: t('chat.reaction.add', { emoji: '👍' }) }))
      expect(onToggleReaction).toHaveBeenCalledExactlyOnceWith('👍')
    },
  )

  it.todo('закрывает меню и возвращает фокус на «…» после выбора реакции')

  it('does not render "Повторить отправку" for a non-own or non-failed message', () => {
    render(
      <MessageActions
        message={textItem({ eventId: '$m1', sender: '@operator:bank' })}
        isOwn={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.queryByText(t('chat.action.retry'))).not.toBeInTheDocument()
  })
})
