import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { MessageActions } from './MessageActions'

const resendMessage = vi.fn()

vi.mock('../../hooks/useChatActions', () => ({
  useChatActions: () => ({ resendMessage }),
}))

describe('MessageActions', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    resendMessage.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the dropdown on trigger click and closes it on outside click', async () => {
    render(
      <MessageActions
        localId="m1"
        text="hello"
        canRetry={false}
      />,
    )

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Меню' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('copies the message body to the clipboard when "Копировать" is clicked', async () => {
    render(
      <MessageActions
        localId="m1"
        text="hello world"
        canRetry={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Меню' }))
    fireEvent.click(screen.getByText(t('chat.action.copy')))

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world'))
  })

  it('a real tap on "Копировать" (pointerdown → click) is not swallowed by the outside-close handler', async () => {
    render(
      <MessageActions
        localId="m1"
        text="hello world"
        canRetry={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Меню' }))
    const item = screen.getByText(t('chat.action.copy'))

    // на реальном устройстве click предваряется pointerdown/pointerup по тому же элементу —
    // документный pointerdown-хендлер не должен закрыть меню раньше, чем долетит click
    fireEvent.pointerDown(item)
    fireEvent.pointerUp(item)
    fireEvent.click(item)

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world'))
  })

  it('shows "Повторить" only when canRetry is true, and invokes resendMessage with the message localId', () => {
    render(
      <MessageActions
        localId="m1"
        text="hello"
        canRetry={true}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Меню' }))
    fireEvent.click(screen.getByText(t('chat.action.retry')))

    expect(resendMessage).toHaveBeenCalledExactlyOnceWith('m1')
  })

  it('does not render "Повторить отправку" when canRetry is false', () => {
    render(
      <MessageActions
        localId="m1"
        text="hello"
        canRetry={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Меню' }))

    expect(screen.queryByText(t('chat.action.retry'))).not.toBeInTheDocument()
  })
})
