import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
