import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { systemItem, textItem } from '../../shared/testUtils/matrixFixtures'
import type { TextTimelineItem } from '../../domain/timeline'
import { INITIAL_ROOM_STATE, chatStore } from '../../store/store'
import { MessageList } from './MessageList'

const ME = '@me:bank'

// resendMessage дёргает ChatController → MatrixService, которые в этом тесте не поднимаются
vi.mock('../../hooks/useChatActions', () => ({
  useChatActions: () => ({ resendMessage: vi.fn(), markRead: vi.fn() }),
}))

function message(
  overrides: Partial<Omit<TextTimelineItem, 'kind' | 'content'>> & { body?: string },
): TextTimelineItem {
  return textItem({
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
    chatStore.setState({ room: INITIAL_ROOM_STATE })
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
        timeline: [
          message({ localId: 'm1', eventId: 'm1', ts: day1, body: 'a' }),
          message({ localId: 'm2', eventId: 'm2', ts: day1 + 1000, body: 'b' }),
          message({ localId: 'm3', eventId: 'm3', ts: day2, body: 'c' }),
        ],
      },
    })

    render(<MessageList userId={ME} />)

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
        timeline: [
          message({ localId: 'm1', eventId: 'm1', ts: day1, body: 'a' }),
          message({ localId: 'm2', eventId: 'm2', ts: day1 + 1000, body: 'b' }),
          message({ localId: 'm3', eventId: 'm3', ts: day2, body: 'c' }),
        ],
      },
    })

    const { container } = render(<MessageList userId={ME} />)
    const separators = container.querySelectorAll('[data-date-label]')

    expect(separators).toHaveLength(2)
    expect(separators[0]?.parentElement?.textContent).toContain('a')
    expect(separators[0]?.parentElement?.textContent).toContain('b')
    expect(separators[0]?.parentElement?.textContent).not.toContain('c')
    expect(separators[1]?.parentElement?.textContent).toContain('c')
    expect(separators[1]?.parentElement?.textContent).not.toContain('a')
  })

  it('marks ALL own messages up to the receipt position, not only the receipted one (read up to)', () => {
    const early = new Date('2026-07-01T10:00:00').getTime()
    const late = new Date('2026-07-01T10:05:00').getTime()

    chatStore.setState({
      room: {
        ...INITIAL_ROOM_STATE,
        timeline: [
          message({ localId: 'a', eventId: '$a', sender: ME, ts: early, body: 'first' }),
          message({ localId: 'b', eventId: '$b', sender: ME, ts: late, body: 'second' }),
        ],
        // оператор прислал receipt ТОЛЬКО на последнее ($b)
        readReceipts: { '@op:bank': { eventId: '$b' } },
      },
    })

    const { container } = render(<MessageList userId={ME} />)
    const ticks = container.querySelectorAll('[data-role="message-bubble"] svg')

    // оба тика (включая ранний $a) — фиолетовые: порог покрывает всё ≤ ts($b)
    expect(ticks).toHaveLength(2)
    ticks.forEach((svg) => {
      expect((svg as SVGElement).style.color).toBe('var(--c-purple-light)')
    })
  })

  it('marks only operator messages as receipt candidates, never own ones (incl. optimistic drafts)', () => {
    // data-receipt-id — контракт с useSendReadReceipts: он сканирует ИМЕННО эти узлы. Своё
    // сообщение подтверждать нечего; optimistic-черновик всегда свой, поэтому отсекается тем же
    // «чужое» — POST на него дал бы 404 (бэкенд валидирует наличие события в комнате).
    const ts = new Date('2026-07-01T10:00:00').getTime()

    chatStore.setState({
      room: {
        ...INITIAL_ROOM_STATE,
        timeline: [
          message({ localId: 'a', eventId: '$op', sender: '@op:bank', ts, body: 'от оператора' }),
          message({ localId: 'b', eventId: '$own', sender: ME, ts, body: 'своё' }),
          message({ localId: 'c', eventId: 'optimistic:c', sender: ME, ts, body: 'черновик' }),
        ],
      },
    })

    const { container } = render(<MessageList userId={ME} />)
    const candidates = [...container.querySelectorAll('[data-receipt-id]')]

    expect(candidates.map((el) => el.getAttribute('data-receipt-id'))).toEqual(['$op'])
  })

  it('renders a system message as a plain badge, without message actions or bubble status', () => {
    const day1 = new Date('2026-07-01T10:00:00').getTime()

    chatStore.setState({
      room: {
        ...INITIAL_ROOM_STATE,
        timeline: [
          systemItem({ localId: 'sys1', eventId: 'sys1', ts: day1, body: 'Оператор завершил чат' }),
        ],
      },
    })

    const { container } = render(<MessageList userId={ME} />)

    expect(screen.getByText('Оператор завершил чат')).toBeInTheDocument()
    expect(container.querySelector('[data-role="system-message"]')).toBeInTheDocument()
    expect(container.querySelector('[data-role="message-actions-trigger"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-role="message-bubble"]')).not.toBeInTheDocument()
  })
})
