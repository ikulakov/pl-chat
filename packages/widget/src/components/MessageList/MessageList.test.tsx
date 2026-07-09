import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatMessage } from '../../shared/testUtils/matrixFixtures'
import type { ChatMessage } from '../../store/model'
import { INITIAL_ROOM_STATE, chatStore } from '../../store/store'
import { MessageList } from './MessageList'

// resendMessage дёргает ChatController → MatrixService, которые в этом тесте не поднимаются
vi.mock('../../hooks/useChatActions', () => ({
  useChatActions: () => ({ resendMessage: vi.fn() }),
}))

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return chatMessage({
    localId: overrides.eventId ?? 'local',
    eventId: 'event',
    ts: Date.now(),
    ...overrides,
  })
}

describe('MessageList', () => {
  beforeEach(() => {
    // сброс стора до рендера: в afterEach setState перерисовал бы ещё
    // смонтированный компонент вне act() (cleanup RTL идёт позже) → warning
    chatStore.setState({ room: INITIAL_ROOM_STATE, identity: null })
    vi.useFakeTimers()
    // "сейчас" далеко впереди дат сообщений — чтобы формат не съехал в "Сегодня"/"Вчера"
    vi.setSystemTime(new Date('2026-08-15T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('inserts exactly one date separator per distinct calendar day, not per message', () => {
    const day1 = new Date('2026-07-01T10:00:00').getTime()
    const day2 = new Date('2026-07-02T10:00:00').getTime()

    chatStore.setState({
      room: {
        ...INITIAL_ROOM_STATE,
        messages: [
          message({ localId: 'm1', eventId: 'm1', ts: day1, body: 'a' }),
          message({ localId: 'm2', eventId: 'm2', ts: day1 + 1000, body: 'b' }),
          message({ localId: 'm3', eventId: 'm3', ts: day2, body: 'c' }),
        ],
      },
    })

    render(<MessageList />)

    expect(screen.getAllByText('1 июля')).toHaveLength(1)
    expect(screen.getAllByText('2 июля')).toHaveLength(1)
  })

  it('nests each day into its own wrapper so a date separator only owns messages from that day', () => {
    // важно для sticky-хендоффа: каждый .dateSep должен "прилипать" в пределах своего дня,
    // а не всего списка целиком — иначе смена дат при скролле не будет бесшовной
    const day1 = new Date('2026-07-01T10:00:00').getTime()
    const day2 = new Date('2026-07-02T10:00:00').getTime()

    chatStore.setState({
      room: {
        ...INITIAL_ROOM_STATE,
        messages: [
          message({ localId: 'm1', eventId: 'm1', ts: day1, body: 'a' }),
          message({ localId: 'm2', eventId: 'm2', ts: day1 + 1000, body: 'b' }),
          message({ localId: 'm3', eventId: 'm3', ts: day2, body: 'c' }),
        ],
      },
    })

    const { container } = render(<MessageList />)
    const separators = container.querySelectorAll('[data-date-label]')

    expect(separators).toHaveLength(2)
    expect(separators[0]?.parentElement?.textContent).toContain('a')
    expect(separators[0]?.parentElement?.textContent).toContain('b')
    expect(separators[0]?.parentElement?.textContent).not.toContain('c')
    expect(separators[1]?.parentElement?.textContent).toContain('c')
    expect(separators[1]?.parentElement?.textContent).not.toContain('a')
  })
})
