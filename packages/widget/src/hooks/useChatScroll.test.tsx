import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeIntersectionObserver } from '../../test.setup'
import type { TimelineItem } from '../domain/timeline'
import { textItem } from '../shared/testUtils/matrixFixtures'
import { useChatScroll } from './useChatScroll'
import { ITEM_ID_ATTR } from './useLoadMoreHistory'

const ME = '@me:bank'
const OPERATOR = '@op:bank'

let seq = 0
function message(sender: string): TimelineItem {
  seq += 1
  const id = `m${seq}`
  return textItem({ localId: id, eventId: id, sender, body: 'x', ts: seq })
}

// Последний созданный IntersectionObserver — через него эмулируем пересечение сентинела.
function sentinel(): FakeIntersectionObserver {
  const observer = FakeIntersectionObserver.instances.at(-1)
  if (!observer) throw new Error('IntersectionObserver не создан')
  return observer
}

// Наблюдатель для хука — только триггер пересчёта, положение он берёт из геометрии
// (scrollHeight в setup = 1000). Поэтому тесты двигают scrollTop, а отчёт наблюдателя
// не передают вовсе — на состояние он не влияет.
function scrollUp(container: HTMLElement): void {
  container.scrollTop = 0
  act(() => sentinel().trigger())
}

function scrollToBottom(container: HTMLElement): void {
  container.scrollTop = 1000
  act(() => sentinel().trigger())
}

function setup(initialTimeline: TimelineItem[], userId: string = ME) {
  const container = document.createElement('div')
  const bottom = document.createElement('div')
  container.appendChild(bottom)

  const scrollTo = vi.fn()
  container.scrollTo = scrollTo as unknown as typeof container.scrollTo
  Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true })

  const containerRef = { current: container }
  const bottomRef = { current: bottom }

  const view = renderHook(
    ({ timeline }: { timeline: TimelineItem[] }) =>
      useChatScroll({ timeline, userId, containerRef, bottomRef }),
    { initialProps: { timeline: initialTimeline } },
  )

  return { ...view, scrollTo, container }
}

describe('useChatScroll', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('auto-scrolls to a freshly sent own message even when the user has scrolled up', () => {
    const { rerender, scrollTo, container } = setup([message(OPERATOR)])
    scrollUp(container) // пользователь ушёл вверх
    scrollTo.mockClear()

    act(() => rerender({ timeline: [message(OPERATOR), message(ME)] }))

    expect(scrollTo).not.toHaveBeenCalled()
    expect(container.scrollTop).toBe(1000)
  })

  it('does not auto-scroll on an incoming message while the user is scrolled up', () => {
    const { rerender, scrollTo, container } = setup([message(OPERATOR)])
    scrollUp(container)
    scrollTo.mockClear()

    act(() => rerender({ timeline: [message(OPERATOR), message(OPERATOR)] }))

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('auto-scrolls on an incoming message while the user is near the bottom', () => {
    const { rerender, scrollTo, container } = setup([message(OPERATOR)])
    scrollToBottom(container)
    scrollTo.mockClear()

    act(() => rerender({ timeline: [message(OPERATOR), message(OPERATOR)] }))

    expect(scrollTo).toHaveBeenCalled()
  })

  it('toggles the scroll-to-bottom button as the sentinel leaves and re-enters the viewport', () => {
    const { result, container } = setup([message(OPERATOR)])

    scrollUp(container)
    expect(result.current.isNearBottom).toBe(false)

    scrollToBottom(container)
    expect(result.current.isNearBottom).toBe(true)
  })

  it('ложный промах IntersectionObserver не поднимает кнопку «вниз», когда лента у самого низа: отчёт, посчитанный пока бокс iframe был 0×0 (хост ресайзит рамку после OPEN), приезжает уже по нормальной геометрии', () => {
    const { result, container } = setup([message(OPERATOR)])
    scrollToBottom(container)

    act(() => sentinel().trigger(false))

    expect(result.current.isNearBottom).toBe(true)
  })

  it('преждевременный scrollend (инстант-снап до цели, см. SMOOTH_TAIL_PX) не размораживает isNearBottom, пока DOM реально не у низа — иначе на длинном прыжке (/card many) на кадр мигает кнопка «вниз»', () => {
    const { rerender, container, result } = setup([message(OPERATOR)])
    scrollToBottom(container) // пользователь у низа → следующее сообщение уйдёт smooth-скроллом

    // smooth-путь: isAutoScrollingRef взводится, IO-обновления isNearBottom заморожены
    act(() => rerender({ timeline: [message(OPERATOR), message(OPERATOR)] }))

    Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true })

    // Инстант-снап scrollListTo остановился в 500px от цели (scrollHeight=1000) — ровно та
    // геометрия, что оставляет после себя частичный джамп на длинном прыжке. Браузер может
    // прислать 'scrollend' уже здесь, до того как smooth-хвост реально доехал.
    container.scrollTop = 300
    act(() => container.dispatchEvent(new Event('scrollend')))

    // Премature scrollend должен быть проигнорирован: заморозка не снята, состояние не мигнуло.
    expect(result.current.isNearBottom).toBe(true)

    // Настоящий scrollend — smooth-хвост доехал, DOM реально у низа.
    container.scrollTop = 800
    act(() => container.dispatchEvent(new Event('scrollend')))

    expect(result.current.isNearBottom).toBe(true)

    // Разморозка подтверждена: пересчёт снова управляет состоянием, а не игнорируется.
    scrollUp(container)
    expect(result.current.isNearBottom).toBe(false)
  })

  it('scrollToBottom scrolls the container smoothly', () => {
    const { result, scrollTo } = setup([message(OPERATOR)])
    scrollTo.mockClear()

    act(() => result.current.scrollToBottom())

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
  })

  it('scrollToItem resolves the row by its id, jumps to it, and highlights it', () => {
    const { result, scrollTo, container } = setup([message(OPERATOR)])
    const row = document.createElement('div')
    const animate = vi.fn()
    row.setAttribute(ITEM_ID_ATTR, 'target')
    row.animate = animate as unknown as typeof row.animate
    container.appendChild(row)
    Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(row, 'offsetHeight', { value: 40, configurable: true })
    container.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    row.getBoundingClientRect = () => ({ top: 500 }) as DOMRect
    container.scrollTop = 0
    scrollTo.mockClear()

    act(() => result.current.scrollToItem('target'))

    expect(scrollTo).not.toHaveBeenCalled()
    expect(container.scrollTop).toBe(320)
    expect(animate).toHaveBeenCalledWith([{ opacity: 0.78 }, { opacity: 1 }], {
      duration: 1600,
      easing: 'ease-out',
    })
  })

  it('scrollToItem returns null and does not scroll when the row is absent', () => {
    const { result, scrollTo } = setup([message(OPERATOR)])
    scrollTo.mockClear()

    act(() => result.current.scrollToItem('missing'))

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
