import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TimelineItem } from '../domain/timeline'
import { RECEIPT_ID_ATTR, SCAN_THROTTLE_MS, useSendReadReceipts } from './useSendReadReceipts'

const { markRead } = vi.hoisted(() => ({ markRead: vi.fn() }))
vi.mock('./useChatActions', () => ({ useChatActions: () => ({ markRead }) }))

const FOLD = 500 // нижняя кромка ленты

// Кандидат на m.read в DOM. Отбором «чужое сообщение» занимается MessageRow (он и решает,
// вешать ли data-receipt-id) — хук просто читает то, что отрисовано.
function row(eventId: string, bottom: number): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute(RECEIPT_ID_ATTR, eventId)
  el.getBoundingClientRect = () => ({ bottom }) as DOMRect
  return el
}

function render(params: { rows: HTMLElement[]; isOpen?: boolean; timeline?: TimelineItem[] }) {
  const container = document.createElement('div')
  container.getBoundingClientRect = () => ({ bottom: FOLD }) as DOMRect
  params.rows.forEach((r) => container.appendChild(r))
  const containerRef = { current: container }

  renderHook(() =>
    useSendReadReceipts({
      timeline: params.timeline ?? [],
      isOpen: params.isOpen ?? true,
      containerRef,
    }),
  )

  return { container }
}

afterEach(() => {
  markRead.mockClear()
  vi.useRealTimers()
})

describe('useSendReadReceipts', () => {
  it('подтверждает самое новое ДОЧИТАННОЕ сообщение, а не последнее в ленте', () => {
    // op3 висит под фолдом — клиент до него не долистал. Правило Element: receipt по нижней
    // кромке события. Подтвердить op3 значило бы соврать оператору «прочитано».
    render({ rows: [row('$op1', 100), row('$op2', 200), row('$op3', 600)] })

    expect(markRead).toHaveBeenCalledExactlyOnceWith('$op2')
  })

  it('засчитывает сообщение, нижняя кромка которого ровно на фолде', () => {
    render({ rows: [row('$op1', FOLD)] })

    expect(markRead).toHaveBeenCalledExactlyOnceWith('$op1')
  })

  it('ничего не шлёт, пока ни одно сообщение оператора не дочитано', () => {
    render({ rows: [row('$op1', 600)] })

    expect(markRead).not.toHaveBeenCalled()
  })

  it('пересканирует по скроллу — клиент дочитывает ленту, ничего не отправляя', () => {
    vi.useFakeTimers()
    const op = row('$op1', 600)
    const { container } = render({ rows: [op] })
    expect(markRead).not.toHaveBeenCalled()

    // клиент доскроллил: сообщение целиком вышло на экран
    op.getBoundingClientRect = () => ({ bottom: 400 }) as DOMRect
    act(() => {
      container.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(SCAN_THROTTLE_MS)
    })

    expect(markRead).toHaveBeenCalledExactlyOnceWith('$op1')
  })

  it('после прыжка кнопкой «вниз» подтверждает последнее сообщение пачки', () => {
    vi.useFakeTimers()
    // оператор прислал 5 сообщений, пока клиент был проскроллен вверх — все под фолдом
    const rows = [
      row('$op1', 600),
      row('$op2', 700),
      row('$op3', 800),
      row('$op4', 900),
      row('$op5', 1000),
    ]
    const { container } = render({ rows })
    expect(markRead).not.toHaveBeenCalled()

    // клик по кнопке «вниз»: лента доехала до низа, вся пачка выше фолда
    rows.forEach((r, i) => {
      r.getBoundingClientRect = () => ({ bottom: 100 + i * 50 }) as DOMRect
    })
    act(() => {
      container.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(SCAN_THROTTLE_MS)
    })

    // одного receipt на $op5 достаточно: read-up-to накрывает $op1..$op4
    expect(markRead).toHaveBeenCalledExactlyOnceWith('$op5')
  })

  it('не шлёт при закрытой панели', () => {
    render({ rows: [row('$op1', 100)], isOpen: false })

    expect(markRead).not.toHaveBeenCalled()
  })

  it('не шлёт при скрытой вкладке, но досканирует по возврату в неё', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)

    render({ rows: [row('$op1', 100)] })
    expect(markRead).not.toHaveBeenCalled()

    // вкладка снова видима → visibilitychange → scan
    hidden.mockReturnValue(false)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(markRead).toHaveBeenCalledExactlyOnceWith('$op1')
    hidden.mockRestore()
  })

  it('ничего не шлёт, если сообщений оператора нет', () => {
    render({ rows: [] })

    expect(markRead).not.toHaveBeenCalled()
  })
})
