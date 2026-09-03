import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURES } from '../../../features'
import { t } from '../../../i18n'
import { fileItem, textItem } from '../../../shared/testUtils/matrixFixtures'
import { MessageActions } from './MessageActions'

const resendMessage = vi.fn()
const replyTo = vi.fn()
const toggleReaction = vi.fn()

vi.mock('../../../hooks/useChatActions', () => ({
  useChatActions: () => ({ resendMessage, replyTo, toggleReaction }),
}))

describe('MessageActions', () => {
  beforeEach(() => {
    // Реакции включаем явно: тесты не должны зависеть от того, в каком положении флаг
    // лежит в features.ts на момент сборки. Выключенное состояние проверяет свой тест ниже.
    vi.spyOn(FEATURES, 'reactions', 'get').mockReturnValue(true)
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    resendMessage.mockClear()
    replyTo.mockClear()
    toggleReaction.mockClear()
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
        reactions={[]}
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
        reactions={[]}
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
        reactions={[]}
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
        reactions={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.queryByText(t('chat.action.reply'))).not.toBeInTheDocument()
  })

  it('прячет «Ответить» у сообщения с пустым body — очищенное/недоступное, цитата на него бессмысленна', () => {
    render(
      <MessageActions
        message={textItem({ eventId: '$m1', sender: '@operator:bank', body: '   ' })}
        isOwn={false}
        reactions={[]}
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
        reactions={[]}
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

  it('прячет «Копировать» у файла без подписи — копировать нечего, body пуст', () => {
    render(
      <MessageActions
        message={fileItem()}
        isOwn={false}
        reactions={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.queryByText(t('chat.action.copy'))).not.toBeInTheDocument()
  })

  it('показывает «Ответить» у файла даже без подписи — сам файл уже контент для цитаты', () => {
    render(
      <MessageActions
        message={fileItem()}
        isOwn={false}
        reactions={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.getByText(t('chat.action.reply'))).toBeInTheDocument()
  })

  it('«Ответить» у файла без подписи кладёт в превью цитаты имя файла, а не пустую строку', () => {
    render(
      <MessageActions
        message={fileItem()}
        isOwn={false}
        reactions={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    fireEvent.click(screen.getByText(t('chat.action.reply')))

    expect(replyTo).toHaveBeenCalledExactlyOnceWith({
      eventId: '$m1',
      sender: '@operator:bank',
      body: 'doc.pdf',
    })
  })

  it('«Ответить» у файла с подписью кладёт в превью саму подпись, не имя файла', () => {
    render(
      <MessageActions
        message={fileItem({ body: 'договор на подпись' })}
        isOwn={false}
        reactions={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    fireEvent.click(screen.getByText(t('chat.action.reply')))

    expect(replyTo).toHaveBeenCalledExactlyOnceWith({
      eventId: '$m1',
      sender: '@operator:bank',
      body: 'договор на подпись',
    })
  })

  it('показывает «Копировать» у файла с реальной подписью (body отличается от filename)', async () => {
    render(
      <MessageActions
        message={fileItem({ body: 'договор на подпись' })}
        isOwn={false}
        reactions={[]}
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
        reactions={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    expect(screen.queryByText(t('chat.action.retry'))).not.toBeInTheDocument()

    // байты доехали, упал сам /send — upload снят редьюсером, повтор снова за меню
    rerender(
      <MessageActions
        message={fileItem({ localId: 'm1', sendStatus: 'failed' })}
        isOwn={true}
        reactions={[]}
      />,
    )

    expect(screen.getByText(t('chat.action.retry'))).toBeInTheDocument()
  })

  it('показывает панель быстрых реакций вместе с меню и отдаёт выбранный ключ', () => {
    render(
      <MessageActions
        message={textItem({ eventId: '$m1', sender: '@operator:bank', body: 'hello' })}
        isOwn={false}
        reactions={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))
    fireEvent.click(screen.getByRole('button', { name: t('chat.reaction.add', { emoji: '👍' }) }))

    expect(toggleReaction).toHaveBeenCalledExactlyOnceWith('$m1', '👍')
  })

  it('помечает уже поставленную реакцию — тот же слот её и снимает', () => {
    render(
      <MessageActions
        message={textItem({ eventId: '$m1', sender: '@operator:bank', body: 'hello' })}
        isOwn={false}
        reactions={[{ key: '👍', count: 1, ownEventId: '$r1' }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(
      screen.getByRole('button', { name: t('chat.reaction.remove', { emoji: '👍' }) }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('прячет панель реакций у сообщения с оптимистичным eventId — аннотировать нечего', () => {
    render(
      <MessageActions
        message={textItem({ eventId: 'optimistic:m1', sender: '@user:bank', body: 'hello' })}
        isOwn={true}
        reactions={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })

  it('при выключённой фиче реакций прячет панель, но оставляет ответ и копирование', () => {
    vi.spyOn(FEATURES, 'reactions', 'get').mockReturnValue(false)

    render(
      <MessageActions
        message={textItem({ eventId: '$m1', sender: '@operator:bank', body: 'hello' })}
        isOwn={false}
        reactions={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.getByText(t('chat.action.reply'))).toBeInTheDocument()
    expect(screen.getByText(t('chat.action.copy'))).toBeInTheDocument()
  })

  it('does not render "Повторить отправку" for a non-own or non-failed message', () => {
    render(
      <MessageActions
        message={textItem({ eventId: '$m1', sender: '@operator:bank' })}
        isOwn={false}
        reactions={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.action.menu') }))

    expect(screen.queryByText(t('chat.action.retry'))).not.toBeInTheDocument()
  })
})
