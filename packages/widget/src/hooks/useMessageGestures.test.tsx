import { act, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestPointerEvent, touch } from '../shared/testUtils/pointer'
import { LONG_PRESS_MS, SWIPE_TRIGGER_PX, useMessageGestures } from './useMessageGestures'

interface HarnessProps {
  onLongPress: () => void
  onSwipe: (() => void) | undefined
  onClick?: () => void
}

function Harness({ onLongPress, onSwipe, onClick }: HarnessProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { isSwiping } = useMessageGestures(ref, { onLongPress, onSwipe })

  return (
    <div
      ref={ref}
      data-testid="row"
      data-swiping={isSwiping}
      onClick={onClick}
    />
  )
}

function press(el: Element, x = 200, y = 100) {
  fireEvent.pointerDown(el, { ...touch, clientX: x, clientY: y })
}

describe('useMessageGestures', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', TestPointerEvent)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('долгое нажатие открывает меню и гасит click, который браузер шлёт при отпускании', () => {
    const onLongPress = vi.fn()
    const onClick = vi.fn()
    const { getByTestId } = render(
      <Harness
        onLongPress={onLongPress}
        onSwipe={undefined}
        onClick={onClick}
      />,
    )
    const row = getByTestId('row')

    press(row)
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    fireEvent.pointerUp(row, touch)
    fireEvent.click(row)

    expect(onLongPress).toHaveBeenCalledOnce()
    expect(onClick).not.toHaveBeenCalled()

    // Следующий обычный тап click уже получает.
    press(row)
    fireEvent.pointerUp(row, touch)
    fireEvent.click(row)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('движение пальца отменяет долгое нажатие: это прокрутка, а не удержание', () => {
    const onLongPress = vi.fn()
    const { getByTestId } = render(
      <Harness
        onLongPress={onLongPress}
        onSwipe={undefined}
      />,
    )
    const row = getByTestId('row')

    press(row)
    fireEvent.pointerMove(row, { ...touch, clientX: 200, clientY: 130 })
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('мышь жесты не запускает — у неё есть hover-кнопка', () => {
    const onLongPress = vi.fn()
    const { getByTestId } = render(
      <Harness
        onLongPress={onLongPress}
        onSwipe={undefined}
      />,
    )

    fireEvent.pointerDown(getByTestId('row'), {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    })
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('свайп влево за порог включает ответ, недотянутый — нет', () => {
    const onSwipe = vi.fn()
    const { getByTestId } = render(
      <Harness
        onLongPress={() => {}}
        onSwipe={onSwipe}
      />,
    )
    const row = getByTestId('row')

    press(row)
    fireEvent.pointerMove(row, { ...touch, clientX: 200 - SWIPE_TRIGGER_PX / 2, clientY: 100 })
    fireEvent.pointerUp(row, touch)
    expect(onSwipe).not.toHaveBeenCalled()

    press(row)
    fireEvent.pointerMove(row, { ...touch, clientX: 200 - SWIPE_TRIGGER_PX - 4, clientY: 100 })
    fireEvent.pointerUp(row, touch)
    expect(onSwipe).toHaveBeenCalledOnce()
  })

  it('отменённый браузером свайп ответ не включает, а ряд возвращается на место', () => {
    const onSwipe = vi.fn()
    const { getByTestId } = render(
      <Harness
        onLongPress={() => {}}
        onSwipe={onSwipe}
      />,
    )
    const row = getByTestId('row')

    press(row)
    fireEvent.pointerMove(row, { ...touch, clientX: 200 - SWIPE_TRIGGER_PX - 4, clientY: 100 })
    expect(row.style.transform).not.toBe('')
    expect(row).toHaveAttribute('data-swiping', 'true')

    fireEvent.pointerCancel(row, touch)
    act(() => vi.runAllTimers())

    expect(onSwipe).not.toHaveBeenCalled()
    expect(row.style.transform).toBe('')
    // флаг снимается после возврата ряда, а не в момент отпускания: подсказка уходит вместе с ним
    expect(row).toHaveAttribute('data-swiping', 'false')
  })

  it('без цели ответа свайп не двигает ряд', () => {
    const { getByTestId } = render(
      <Harness
        onLongPress={() => {}}
        onSwipe={undefined}
      />,
    )
    const row = getByTestId('row')

    press(row)
    fireEvent.pointerMove(row, { ...touch, clientX: 100, clientY: 100 })

    expect(row.style.transform).toBe('')
    expect(row).toHaveAttribute('data-swiping', 'false')
  })
})
