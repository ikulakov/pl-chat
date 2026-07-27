import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../i18n'
import type { ReplyTarget } from '../store/state'
import { chatStore, INITIAL_ROOM_STATE, INITIAL_RUNTIME_STATE } from '../store/store'
import { MessageInput } from './MessageInput'

const ME = '@me:bank'
const OPERATOR = '@op:bank'

const sendMessage = vi.fn()
const cancelReply = vi.fn()
vi.mock('../hooks/useChatActions', () => ({
  useChatActions: () => ({ sendMessage, cancelReply }),
}))

beforeEach(() => {
  // стор — синглтон: сбрасываем цель ответа/идентичность до рендера, чтобы состояние
  // reply-тестов не протекало в тесты обычной отправки
  chatStore.setState({ ...INITIAL_RUNTIME_STATE, room: INITIAL_ROOM_STATE })
})

afterEach(() => {
  sendMessage.mockReset()
  cancelReply.mockReset()
})

describe('MessageInput — семантика отправки', () => {
  function typeThenEnter(value: string, opts: { shiftKey?: boolean } = {}) {
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: opts.shiftKey ?? false })
    return textarea as HTMLTextAreaElement
  }

  it('Enter отправляет обрезанный текст и очищает поле', () => {
    render(<MessageInput />)

    const textarea = typeThenEnter('  привет  ')

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('привет', undefined)
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

describe('MessageInput — режим ответа', () => {
  function setReply(target: ReplyTarget, userId: string = ME) {
    chatStore.setState({
      identity: { userId, roomId: '!r:bank' },
      room: {
        ...INITIAL_ROOM_STATE,
        replyTarget: target,
        operator: { id: OPERATOR, displayName: 'Оля', isActive: true },
      },
    })
  }

  it('отправляет текст с eventId цитаты — иначе связь ответа не уедет на бэкенд', () => {
    setReply({ eventId: '$parent', sender: OPERATOR, body: 'исходное' })
    render(<MessageInput />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'да, подходит' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('да, подходит', '$parent')
  })

  it('показывает превью цитаты: оператора и текст исходного сообщения', () => {
    setReply({ eventId: '$parent', sender: OPERATOR, body: 'исходное сообщение' })
    render(<MessageInput />)

    expect(screen.getByText(t('chat.reply.operator'))).toBeInTheDocument()
    expect(screen.getByText('исходное сообщение')).toBeInTheDocument()
  })

  it('автор цитаты — «Вы», когда отвечаешь на собственное сообщение', () => {
    setReply({ eventId: '$mine', sender: ME, body: 'мой вопрос' })
    render(<MessageInput />)

    expect(screen.getByText(t('chat.reply.you'))).toBeInTheDocument()
  })

  it('Escape отменяет ответ', () => {
    setReply({ eventId: '$parent', sender: OPERATOR, body: 'исходное' })
    render(<MessageInput />)

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })

    expect(cancelReply).toHaveBeenCalledOnce()
  })

  it('кнопка отмены сбрасывает цель ответа', () => {
    setReply({ eventId: '$parent', sender: OPERATOR, body: 'исходное' })
    render(<MessageInput />)

    fireEvent.click(screen.getByRole('button', { name: t('chat.reply.cancel') }))

    expect(cancelReply).toHaveBeenCalledOnce()
  })
})
