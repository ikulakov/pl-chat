import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../i18n'
import { systemItem, textItem } from '../shared/testUtils/matrixFixtures'
import { INITIAL_ROOM_STATE, INITIAL_RUNTIME_STATE } from '../store/initialState'
import { chatStore } from '../store/store'
import { ChatPanel } from './ChatPanel'
import type * as MessageListModule from './MessageList/MessageList'

// Панель тянет за собой ленту и композер, которым нужен живой ChatController —
// в этом тесте нас интересует только подпись в шапке.
const reconnect = vi.hoisted(() => vi.fn())
// Переключатель падения ленты: в остальных тестах она рендерится как есть.
const listCrash = vi.hoisted(() => ({ enabled: false }))

vi.mock('./MessageList/MessageList', async (importOriginal) => {
  const actual = await importOriginal<typeof MessageListModule>()

  return {
    MessageList: (props: Parameters<typeof actual.MessageList>[0]) => {
      if (listCrash.enabled) throw new Error('boom')
      return <actual.MessageList {...props} />
    },
  }
})

vi.mock('../hooks/useChatActions', () => ({
  useChatActions: () => ({
    reconnect,
    loadEmojiIndex: vi.fn(),
    resendMessage: vi.fn(),
    markRead: vi.fn(),
    loadMoreHistory: vi.fn(),
    stopLoadingHistory: vi.fn(),
    sendMessage: vi.fn(),
    close: vi.fn(),
  }),
}))

describe('ChatPanel — подпись в шапке', () => {
  beforeEach(() => {
    chatStore.setState({ ...INITIAL_RUNTIME_STATE, room: INITIAL_ROOM_STATE })
  })

  it('говорит о потере связи вместо статуса оператора', () => {
    chatStore.setState({
      phase: 'ready',
      online: false,
      identity: { userId: '@me:bank', roomId: '!r:bank' },
      room: {
        ...INITIAL_ROOM_STATE,
        operator: { id: '@op:bank', displayName: 'Оля', isActive: true },
      },
    })

    render(<ChatPanel />)

    // «Оператор на связи» — устаревшее утверждение, пока события не доходят.
    expect(screen.getByRole('status')).toHaveTextContent('Устанавливаем соединение')
    expect(screen.queryByText('Оператор на связи')).not.toBeInTheDocument()
  })

  it('не утверждает про оператора, пока сессия не поднялась', () => {
    chatStore.setState({
      phase: 'connecting',
      online: true,
      room: {
        ...INITIAL_ROOM_STATE,
        operator: { id: '@op:bank', displayName: 'Оля', isActive: true },
      },
    })

    render(<ChatPanel />)

    // Оператор в сторе остался с прошлой сессии — но заявлять о нём нечего, пока её нет.
    expect(screen.getByRole('status')).toHaveTextContent('Подключаемся')
    expect(screen.queryByText('Оператор на связи')).not.toBeInTheDocument()
  })

  it('возвращает статус оператора, когда связь восстановилась', () => {
    chatStore.setState({
      phase: 'ready',
      online: true,
      identity: { userId: '@me:bank', roomId: '!r:bank' },
      room: {
        ...INITIAL_ROOM_STATE,
        operator: { id: '@op:bank', displayName: 'Оля', isActive: true },
      },
    })

    render(<ChatPanel />)

    // Живой регион в шапке один и тот же на оба состояния — меняется только его текст.
    expect(screen.getByRole('status')).toHaveTextContent('Оператор на связи')
    expect(screen.queryByText(/Устанавливаем соединение/)).not.toBeInTheDocument()
  })
})

describe('ChatPanel — экран приветствия', () => {
  const readyState = {
    phase: 'ready' as const,
    online: true,
    identity: { userId: '@me:bank', roomId: '!r:bank' },
  }

  beforeEach(() => {
    chatStore.setState({ ...INITIAL_RUNTIME_STATE, room: INITIAL_ROOM_STATE })
  })

  it('показывает приветствие вместо ленты, пока сообщений в комнате нет', () => {
    // Плашки приезжают в свежую комнату сами — лента из одних плашек всё ещё пустая.
    chatStore.setState({
      ...readyState,
      room: {
        ...INITIAL_ROOM_STATE,
        timeline: [
          systemItem({
            localId: 'sys1',
            eventId: 'sys1',
            ts: Date.now(),
            body: 'С вами работает чат-бот',
          }),
        ],
      },
    })

    render(<ChatPanel />)

    expect(screen.getByText('Добро пожаловать в чат!')).toBeInTheDocument()
    expect(screen.queryByText('С вами работает чат-бот')).not.toBeInTheDocument()
  })

  it('оставляет композер на экране приветствия — писать можно сразу', () => {
    chatStore.setState({ ...readyState, room: INITIAL_ROOM_STATE })

    const { container } = render(<ChatPanel />)

    expect(screen.getByText('Добро пожаловать в чат!')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Сообщение' })).toBeInTheDocument()

    const illustration = container.querySelector<HTMLImageElement>('img:not([hidden])')
    expect(illustration).toHaveAttribute('width', '275')
    expect(illustration).toHaveAttribute('height', '188')
  })

  it('уступает место ленте, как только приходит первое сообщение', () => {
    chatStore.setState({
      ...readyState,
      room: {
        ...INITIAL_ROOM_STATE,
        timeline: [
          textItem({ localId: 'm1', eventId: 'm1', ts: Date.now(), body: 'Здравствуйте' }),
        ],
      },
    })

    render(<ChatPanel />)

    expect(screen.getByText('Здравствуйте')).toBeInTheDocument()
    expect(screen.queryByText('Добро пожаловать в чат!')).not.toBeInTheDocument()
  })
})

describe('ChatPanel — системные состояния', () => {
  beforeEach(() => {
    chatStore.setState({ ...INITIAL_RUNTIME_STATE, room: INITIAL_ROOM_STATE })
  })

  it('задаёт стабильный размер inline-иллюстрации ошибки', () => {
    chatStore.setState({
      phase: 'error',
      online: false,
    })

    const { container } = render(<ChatPanel />)

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить данные')

    const illustration = container.querySelector<HTMLImageElement>('img')
    expect(illustration).toHaveAttribute('width', '296')
    expect(illustration).toHaveAttribute('height', '148')
  })
})

describe('ChatPanel — повтор с экрана ошибки', () => {
  const retryButton = () => screen.getByRole('button', { name: t('status.error.retry') })

  beforeEach(() => {
    chatStore.setState({
      ...INITIAL_RUNTIME_STATE,
      room: INITIAL_ROOM_STATE,
      phase: 'error',
    })
    // как настоящий connect: фаза уходит в ожидание синхронно, ещё до первого запроса
    reconnect.mockImplementation(() => chatStore.setState({ phase: 'retrying' }))
  })

  it('оставляет экран ошибки на месте и показывает загрузку на кнопке', () => {
    const { container } = render(<ChatPanel />)
    // ссылку берём до нажатия: на время попытки подпись заменяет спиннер, и имени у кнопки нет
    const button = retryButton()

    fireEvent.click(button)

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить данные')
    expect(button).toHaveAttribute('aria-disabled', 'true')

    // спиннер сессии по центру не подменяет экран
    expect(container.querySelectorAll('[data-role="spinner"]')).toHaveLength(1)
    expect(button).toContainElement(container.querySelector('[data-role="spinner"]'))

    // повторное нажатие во время попытки второй попытки не запускает
    fireEvent.click(button)
    expect(reconnect).toHaveBeenCalledOnce()
  })

  it('после нового отказа снова делает кнопку активной', () => {
    render(<ChatPanel />)

    fireEvent.click(retryButton())
    act(() => chatStore.setState({ phase: 'error' }))

    expect(screen.getByText('Не удалось загрузить данные')).toBeInTheDocument()
    expect(retryButton()).not.toHaveAttribute('aria-disabled')
  })

  it('уступает место чату, когда сессия поднялась', () => {
    render(<ChatPanel />)

    fireEvent.click(retryButton())
    act(() =>
      chatStore.setState({
        phase: 'ready',
        identity: { userId: '@me:bank', roomId: '!r:bank' },
      }),
    )

    // по заголовку, а не по role="alert": у чата свой такой регион, для тостов
    expect(screen.queryByText('Не удалось загрузить данные')).not.toBeInTheDocument()
    expect(screen.getByText('Добро пожаловать в чат!')).toBeInTheDocument()
  })
})

describe('ChatPanel — падение тела панели', () => {
  beforeEach(() => {
    listCrash.enabled = false
  })

  // На мобильном полноэкранная панель закрывает кнопку хоста: без шапки из упавшего чата не выйти.
  it('оставляет шапку с кнопкой закрытия, когда падает лента', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    listCrash.enabled = true
    chatStore.setState({
      ...INITIAL_RUNTIME_STATE,
      phase: 'ready',
      viewport: 'fullscreen',
      identity: { userId: '@me:bank', roomId: '!r:bank' },
      room: {
        ...INITIAL_ROOM_STATE,
        timeline: [
          textItem({ localId: 'm1', eventId: 'm1', ts: Date.now(), body: 'Здравствуйте' }),
        ],
      },
    })

    render(<ChatPanel />)

    expect(screen.getByText(t('status.crash'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('chat.close') })).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()

    listCrash.enabled = false
    vi.mocked(console.error).mockRestore()
  })
})
