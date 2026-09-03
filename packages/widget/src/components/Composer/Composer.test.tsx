/* eslint-disable i18next/no-literal-string -- якорь заглушки пикера, не UI-текст */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURES } from '../../features'
import { t } from '../../i18n'
import { makeFile } from '../../shared/testUtils/matrixFixtures'
import { chatStore, INITIAL_ROOM_STATE, INITIAL_RUNTIME_STATE } from '../../store/store'
import { AttachmentProvider } from '../Attachment/AttachmentProvider'
import { Composer } from './Composer'
import { MAX_MESSAGE_LENGTH } from './MessageTextarea'

const sendMessage = vi.fn()
const sendFile = vi.fn()
const cancelReply = vi.fn()
vi.mock('../../hooks/useChatActions', () => ({
  useChatActions: () => ({ sendMessage, sendFile, cancelReply }),
}))

// Пикер подменён кнопкой-заглушкой: здесь проверяется только то, что делает композер с
// выбранным символом. Поведение самой панели покрыто EmojiPickerButton.test.tsx.
vi.mock('./EmojiPicker/EmojiPickerButton', () => ({
  EmojiPickerButton: ({ onSelectEmoji }: { onSelectEmoji: (char: string) => void }) => (
    <button
      type="button"
      onClick={() => onSelectEmoji('😀')}
    >
      emoji-stub
    </button>
  ),
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

  it('текст сверх лимита не отправляется, а в ошибке видно, на сколько символов перебор', () => {
    render(<Composer />, { wrapper: AttachmentProvider })

    typeThenEnter('я'.repeat(MAX_MESSAGE_LENGTH + 5))

    expect(sendMessage).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: t('input.send') })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Лишних символов: 5')
  })

  it('ровно лимит отправляется', () => {
    render(<Composer />, { wrapper: AttachmentProvider })

    typeThenEnter('я'.repeat(MAX_MESSAGE_LENGTH))

    expect(sendMessage).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

  describe('вставка эмодзи', () => {
    // Флаг фичи держим включённым явно: тесты пикера не должны зависеть от того, в каком
    // положении он лежит в features.ts на момент сборки.
    beforeEach(() => {
      vi.spyOn(FEATURES, 'emoji', 'get').mockReturnValue(true)
    })

    function selectEmojiAt(value: string, start: number, end = start) {
      render(<Composer />, { wrapper: AttachmentProvider })

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value } })
      textarea.setSelectionRange(start, end)

      fireEvent.click(screen.getByText('emoji-stub'))

      return textarea
    }

    it('вставляет символ по каретке, а не в конец', () => {
      const textarea = selectEmojiAt('абвгд', 2)

      expect(textarea.value).toBe('аб😀вгд')
    })

    it('заменяет выделение, как обычный ввод', () => {
      const textarea = selectEmojiAt('абвгд', 1, 4)

      expect(textarea.value).toBe('а😀д')
    })

    it('в пустом поле просто добавляет символ', () => {
      const textarea = selectEmojiAt('', 0)

      expect(textarea.value).toBe('😀')
    })

    it('каретка встаёт после вставленного символа', async () => {
      const textarea = selectEmojiAt('абвгд', 2)

      // Каретку ставит сам setRangeText, но проверяем после коммита React: важно, что он
      // не переписал value и не сбил её.
      await act(async () => {})

      // Эмодзи занимает 2 code unit в UTF-16 — каретка ожидается на 4, а не на 3.
      expect(textarea.selectionStart).toBe(4)
      expect(textarea).toHaveFocus()
    })

    it('вставленный эмодзи уходит в сообщение', () => {
      const textarea = selectEmojiAt('привет', 6)
      fireEvent.keyDown(textarea, { key: 'Enter' })

      expect(sendMessage).toHaveBeenCalledExactlyOnceWith('привет😀', undefined)
    })
  })
})
