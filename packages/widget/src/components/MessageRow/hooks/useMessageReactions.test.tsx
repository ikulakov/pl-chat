import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INITIAL_RUNTIME_STATE } from '@/store/initialState'
import { chatStore } from '@/store/store'
import { useMessageReactions } from './useMessageReactions'

const toggleReaction = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock<unknown>(import('@/hooks/useChatActions'), () => ({
  useChatActions: () => ({ toggleReaction }),
}))

const options = { eventId: '$message', userId: '@me:bank' }
const own = { eventId: '$reaction', sender: options.userId, key: '👍' }

describe('useMessageReactions — подписка на сообщение', () => {
  beforeEach(() => {
    chatStore.setState(INITIAL_RUNTIME_STATE)
    toggleReaction.mockClear()
  })

  it('обновляет свои реакции, сохраняя результат и рендер при чужих обновлениях', () => {
    const rendered = vi.fn()
    const { result } = renderHook(() => {
      rendered()
      return useMessageReactions(options)
    })

    act(() => {
      chatStore.getState().dispatch({
        type: 'reaction.added',
        targetEventId: options.eventId,
        entry: own,
      })
    })
    expect(result.current.summaries).toEqual([{ key: '👍', count: 1, ownEventId: own.eventId }])
    const summaries = result.current.summaries
    rendered.mockClear()

    act(() => {
      chatStore.getState().dispatch({
        type: 'reaction.added',
        targetEventId: '$other',
        entry: own,
      })
      chatStore.getState().dispatch({ type: 'sync.received', cursor: 'next' })
    })
    expect(rendered).not.toHaveBeenCalled()
    expect(result.current.summaries).toBe(summaries)

    act(() => {
      chatStore.getState().dispatch({
        type: 'reaction.removed',
        targetEventId: options.eventId,
        eventId: own.eventId,
      })
    })
    expect(result.current.summaries).toEqual([])
  })

  it('переключает подписку и обработчик при смене сообщения, пересчитывает свою реакцию при смене пользователя', () => {
    chatStore.getState().dispatch({
      type: 'reaction.added',
      targetEventId: options.eventId,
      entry: own,
    })
    const { result, rerender } = renderHook(useMessageReactions, { initialProps: options })
    expect(result.current.summaries[0]?.ownEventId).toBe(own.eventId)

    rerender({ ...options, userId: '@other:bank' })
    expect(result.current.summaries[0]?.ownEventId).toBeNull()

    rerender({ ...options, eventId: '$other' })
    expect(result.current.summaries).toEqual([])
    act(() => {
      chatStore.getState().dispatch({
        type: 'reaction.added',
        targetEventId: '$other',
        entry: own,
      })
    })
    expect(result.current.summaries[0]?.ownEventId).toBe(own.eventId)
    result.current.toggle('👍')
    expect(toggleReaction).toHaveBeenCalledExactlyOnceWith('$other', '👍')
  })

  it('разрешает отправку после замены оптимистичного id серверным', () => {
    const { result, rerender } = renderHook(useMessageReactions, {
      initialProps: { ...options, eventId: 'optimistic:local' },
    })
    expect(result.current.canReact).toBe(false)
    result.current.toggle('👍')
    expect(toggleReaction).not.toHaveBeenCalled()

    rerender(options)
    expect(result.current.canReact).toBe(true)
    result.current.toggle('👍')
    expect(toggleReaction).toHaveBeenCalledExactlyOnceWith(options.eventId, '👍')
  })
})
