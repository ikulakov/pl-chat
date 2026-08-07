import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { makeFile } from '../../shared/testUtils/matrixFixtures'
import { chatStore, INITIAL_ROOM_STATE, INITIAL_RUNTIME_STATE } from '../../store/store'
import { AttachmentProvider } from '../Attachment/AttachmentProvider'
import { Composer } from './Composer'

const sendMessage = vi.fn()
const sendFile = vi.fn()
const cancelReply = vi.fn()
vi.mock('../../hooks/useChatActions', () => ({
  useChatActions: () => ({ sendMessage, sendFile, cancelReply }),
}))

function pickFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type=file]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

describe('Composer — семантика отправки', () => {
  beforeEach(() => {
    // Сбрасываем singleton-store до рендера: изменение store в afterEach обновляло ещё
    // смонтированный Composer и вызывало React warning про update вне act().
    chatStore.setState({ ...INITIAL_RUNTIME_STATE, room: INITIAL_ROOM_STATE })
    sendFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    sendMessage.mockReset()
    sendFile.mockReset()
    cancelReply.mockReset()
  })

  function typeThenEnter(value: string, opts: { shiftKey?: boolean } = {}) {
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: opts.shiftKey ?? false })
    return textarea as HTMLTextAreaElement
  }

  it('Enter отправляет обрезанный текст и очищает поле', () => {
    render(<Composer />, { wrapper: AttachmentProvider })

    const textarea = typeThenEnter('  привет  ')

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('привет', undefined)
    expect(textarea.value).toBe('')
  })

  it('Shift+Enter не отправляет (перенос строки)', () => {
    render(<Composer />, { wrapper: AttachmentProvider })

    typeThenEnter('строка', { shiftKey: true })

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('не отправляет пустой/whitespace-ввод', () => {
    render(<Composer />, { wrapper: AttachmentProvider })

    typeThenEnter('   ')

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('неподдерживаемый тип виден в превью с ошибкой и не отправляется', async () => {
    const { container } = render(<Composer />, { wrapper: AttachmentProvider })

    pickFile(container, makeFile('evil.exe', 100))

    expect(screen.getByText('evil.exe')).toBeInTheDocument()
    expect(screen.getByText('Формат файла не поддерживается')).toBeInTheDocument()

    await act(async () => {
      typeThenEnter('вот файл')
    })

    // отбракованный файл держит и текст: Enter ничего не отправляет
    expect(sendFile).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('слишком большой файл показывает ошибку', () => {
    const { container } = render(<Composer />, { wrapper: AttachmentProvider })

    pickFile(container, makeFile('big.pdf', 11 * 1024 * 1024))

    expect(screen.getByText('Файл слишком большой')).toBeInTheDocument()
  })

  it('файл + текст уходят одним вызовом sendFile с подписью, поле очищается', async () => {
    const { container } = render(<Composer />, { wrapper: AttachmentProvider })

    pickFile(container, makeFile('doc.pdf', 100))
    let textarea!: HTMLTextAreaElement
    await act(async () => {
      textarea = typeThenEnter('глядите договор')
    })

    expect(sendFile).toHaveBeenCalledExactlyOnceWith(
      expect.any(File),
      expect.objectContaining({ caption: 'глядите договор' }),
    )
    expect(sendMessage).not.toHaveBeenCalled()
    expect(textarea.value).toBe('')
  })

  it('композер освобождается сразу — загрузка идёт уже на сообщении в ленте', async () => {
    const { container } = render(<Composer />, { wrapper: AttachmentProvider })

    pickFile(container, makeFile('doc.pdf', 100))
    await act(async () => {
      typeThenEnter('глядите договор')
    })

    // ни превью, ни блокировки: можно печатать следующее сообщение
    expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Убрать вложение')).not.toBeInTheDocument()
  })

  it('файл без текста уходит без подписи', async () => {
    const { container } = render(<Composer />, { wrapper: AttachmentProvider })

    pickFile(container, makeFile('doc.pdf', 100))
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Отправить'))
    })

    // пустая подпись = её нет; в body она не доедет (нормализация в matrixController.sendFile)
    expect(sendFile).toHaveBeenCalledExactlyOnceWith(
      expect.any(File),
      expect.objectContaining({ caption: '' }),
    )
  })

  it('валидный файл показывает вложение, крестик его убирает', () => {
    const { container } = render(<Composer />, { wrapper: AttachmentProvider })

    pickFile(container, makeFile('doc.pdf', 100))
    expect(screen.getByText('doc.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Убрать вложение'))

    expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument()
  })

  describe('ответ на сообщение', () => {
    const ME = '@me:bank'
    const OPERATOR = '@op:bank'

    function setReply(sender: string = OPERATOR) {
      chatStore.setState({
        identity: { userId: ME, roomId: '!r:bank' },
        room: {
          ...INITIAL_ROOM_STATE,
          replyTarget: { eventId: '$parent:bank', sender, body: 'исходное сообщение' },
        },
      })
    }

    beforeEach(() => {
      setReply()
    })

    it('активный replyTarget уходит в sendMessage вторым аргументом', () => {
      render(<Composer />, { wrapper: AttachmentProvider })

      typeThenEnter('да, вот ответ')

      expect(sendMessage).toHaveBeenCalledExactlyOnceWith('да, вот ответ', '$parent:bank')
    })

    it('активный replyTarget уходит в sendFile при отправке файла как ответа', async () => {
      const { container } = render(<Composer />, { wrapper: AttachmentProvider })

      pickFile(container, makeFile('doc.pdf', 100))
      await act(async () => {
        fireEvent.click(screen.getByLabelText('Отправить'))
      })

      expect(sendFile).toHaveBeenCalledExactlyOnceWith(
        expect.any(File),
        expect.objectContaining({ replyToEventId: '$parent:bank' }),
      )
    })

    it('показывает превью цитаты: автора-оператора и текст исходного сообщения', () => {
      render(<Composer />, { wrapper: AttachmentProvider })

      expect(screen.getByText(t('chat.reply.operator'))).toBeInTheDocument()
      expect(screen.getByText('исходное сообщение')).toBeInTheDocument()
    })

    it('автор цитаты — «Вы», когда отвечаешь на собственное сообщение', () => {
      setReply(ME)
      render(<Composer />, { wrapper: AttachmentProvider })

      expect(screen.getByText(t('chat.reply.you'))).toBeInTheDocument()
    })

    it('крестик у баннера ответа вызывает cancelReply', () => {
      render(<Composer />, { wrapper: AttachmentProvider })

      fireEvent.click(screen.getByLabelText('Отменить ответ'))

      expect(cancelReply).toHaveBeenCalledOnce()
    })

    it('Escape в поле ввода вызывает cancelReply', () => {
      render(<Composer />, { wrapper: AttachmentProvider })

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })

      expect(cancelReply).toHaveBeenCalledOnce()
    })
  })
})
