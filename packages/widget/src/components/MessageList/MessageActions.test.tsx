import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { textItem } from '../../shared/testUtils/matrixFixtures'
import { MessageActions } from './MessageActions'

const resendMessage = vi.fn()
const replyTo = vi.fn()

vi.mock('../../hooks/useChatActions', () => ({
  useChatActions: () => ({ resendMessage, replyTo }),
}))

describe('MessageActions', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    resendMessage.mockClear()
    replyTo.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Открытие меню/закрытие по внешнему клику — механика Dropdown, покрыта в Dropdown.test.tsx.
  // Здесь тестируем только то, что MessageActions строит поверх Dropdown: пункты и их действия.

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

  it('прячет «Ответить» у сообщения с оптимистичным eventId — иначе на бэкенд уедет висячий указатель', () => {
    render(
      <MessageActions
        message={textItem({ eventId: 'optimistic:m1', sender: '@user:bank', body: 'hello' })}
        isOwn={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.queryByText(t('chat.action.reply'))).not.toBeInTheDocument()
  })

  it('«Ответить» у отправленного сообщения передаёт цель ответа целиком (eventId, автор, текст)', () => {
    render(
      <MessageActions
        message={textItem({ eventId: '$m1', sender: '@operator:bank', body: 'hello' })}
        isOwn={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    fireEvent.click(screen.getByText(t('chat.action.reply')))

    expect(replyTo).toHaveBeenCalledExactlyOnceWith({
      eventId: '$m1',
      sender: '@operator:bank',
      body: 'hello',
    })
  })

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
