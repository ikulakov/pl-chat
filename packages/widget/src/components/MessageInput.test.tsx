import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageInput } from './MessageInput'

const sendMessage = vi.fn()
vi.mock('../hooks/useChatActions', () => ({
  useChatActions: () => ({ sendMessage }),
}))

describe('MessageInput — семантика отправки', () => {
  afterEach(() => {
    sendMessage.mockReset()
  })

  function typeThenEnter(value: string, opts: { shiftKey?: boolean } = {}) {
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: opts.shiftKey ?? false })
    return textarea as HTMLTextAreaElement
  }

  it('Enter отправляет обрезанный текст и очищает поле', () => {
    render(<MessageInput />)

    const textarea = typeThenEnter('  привет  ')

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('привет')
    expect(textarea.value).toBe('')
  })

  it('Shift+Enter не отправляет (перенос строки)', () => {
    render(<MessageInput />)

    typeThenEnter('строка', { shiftKey: true })

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('не отправляет пустой/whitespace-ввод', () => {
    render(<MessageInput />)

    typeThenEnter('   ')

    expect(sendMessage).not.toHaveBeenCalled()
  })
})
