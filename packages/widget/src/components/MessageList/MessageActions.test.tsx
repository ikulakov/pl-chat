import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageActions } from './MessageActions'
import { t } from '../../i18n'

describe('MessageActions', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the dropdown on trigger click and closes it on outside click', async () => {
    render(
      <MessageActions
        text="hello"
        canRetry={false}
        onRetry={vi.fn()}
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
        text="hello world"
        canRetry={false}
        onRetry={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Меню' }))
    fireEvent.click(screen.getByText(t('chat.action.copy')))

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world'))
  })

  it('a real tap on "Копировать" (pointerdown → click) is not swallowed by the outside-close handler', async () => {
    render(
      <MessageActions
        text="hello world"
        canRetry={false}
        onRetry={vi.fn()}
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

  it('shows "Повторить" only when canRetry is true, and invokes onRetry', () => {
    const onRetry = vi.fn()
    render(
      <MessageActions
        text="hello"
        canRetry={true}
        onRetry={onRetry}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Меню' }))
    fireEvent.click(screen.getByText(t('chat.action.retry')))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('does not render "Повторить отправку" when canRetry is false', () => {
    render(
      <MessageActions
        text="hello"
        canRetry={false}
        onRetry={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Меню' }))

    expect(screen.queryByText(t('chat.action.retry'))).not.toBeInTheDocument()
  })
})
