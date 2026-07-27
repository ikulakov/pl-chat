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
    const { rerender, scrollTo } = setup([message(OPERATOR)])
    act(() => sentinel().trigger(false)) // пользователь ушёл вверх
    scrollTo.mockClear()

    act(() => rerender({ timeline: [message(OPERATOR), message(ME)] }))

    expect(scrollTo).toHaveBeenCalled()
  })

  it('does not auto-scroll on an incoming message while the user is scrolled up', () => {
    const { rerender, scrollTo } = setup([message(OPERATOR)])
    act(() => sentinel().trigger(false))
    scrollTo.mockClear()

    act(() => rerender({ timeline: [message(OPERATOR), message(OPERATOR)] }))

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('auto-scrolls on an incoming message while the user is near the bottom', () => {
    const { rerender, scrollTo } = setup([message(OPERATOR)])
    act(() => sentinel().trigger(true))
    scrollTo.mockClear()

    act(() => rerender({ timeline: [message(OPERATOR), message(OPERATOR)] }))

    expect(scrollTo).toHaveBeenCalled()
  })

  it('toggles the scroll-to-bottom button as the sentinel leaves and re-enters the viewport', () => {
    const { result } = setup([message(OPERATOR)])

    act(() => sentinel().trigger(false))
    expect(result.current.isNearBottom).toBe(false)

    act(() => sentinel().trigger(true))
    expect(result.current.isNearBottom).toBe(true)
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
