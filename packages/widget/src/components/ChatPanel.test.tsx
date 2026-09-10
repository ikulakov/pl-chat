import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { systemItem, textItem } from '../shared/testUtils/matrixFixtures'
import { INITIAL_ROOM_STATE, INITIAL_RUNTIME_STATE, chatStore } from '../store/store'
import { ChatPanel } from './ChatPanel'

// Панель тянет за собой ленту и композер, которым нужен живой ChatController —
// в этом тесте нас интересует только подпись в шапке.
vi.mock('../hooks/useChatActions', () => ({
  useChatActions: () => ({
    reconnect: vi.fn(),
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

  it('показывает спиннер, пока сессия подключается', () => {
    chatStore.setState({
      phase: 'connecting',
      online: true,
    })

    const { container } = render(<ChatPanel />)

    expect(container.querySelector('[data-role="spinner"]')).toBeInTheDocument()
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
