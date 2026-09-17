import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestPointerEvent } from '../../testUtils/pointer'
import { Tooltip } from './Tooltip'

const mouse = { pointerType: 'mouse' }

function Chip({ label, truncatedOnly }: { label: string; truncatedOnly?: boolean }) {
  return (
    <Tooltip
      label={label}
      truncatedOnly={truncatedOnly}
    >
      {(props) => (
        <button
          type="button"
          {...props}
        >
          {label}
        </button>
      )}
    </Tooltip>
  )
}

const tooltip = () => screen.queryByRole('tooltip')

describe('Tooltip — группа задержки', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('PointerEvent', TestPointerEvent)
    // в jsdom нет раскладки: делаем любой триггер «обрезанным»
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
  })

  afterEach(() => {
    // окно группы модульное: выдерживаем его, чтобы тесты не влияли друг на друга
    act(() => vi.advanceTimersByTime(1000))
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // Прежний тултип при переходе ещё держится на задержке скрытия. Раньше группа открывалась
  // только его закрытием, и сосед ждал полную паузу.
  it('при переходе на соседа показывает его сразу и закрывает прежний', () => {
    const { unmount } = render(
      <>
        <Chip label="Первый" />
        <Chip label="Второй" />
      </>,
    )
    const [first, second] = screen.getAllByRole('button')

    fireEvent.pointerEnter(first!, mouse)
    act(() => vi.advanceTimersByTime(400))
    expect(tooltip()).toHaveTextContent('Первый')

    fireEvent.pointerLeave(first!, mouse)
    fireEvent.pointerEnter(second!, mouse)
    act(() => vi.advanceTimersByTime(0))

    expect(screen.getAllByRole('tooltip')).toHaveLength(1)
    expect(tooltip()).toHaveTextContent('Второй')

    unmount()
  })

  it('размонтированный открытым тултип не держит группу', () => {
    const { unmount } = render(<Chip label="Первый" />)
    fireEvent.pointerEnter(screen.getByRole('button'), mouse)
    act(() => vi.advanceTimersByTime(400))
    unmount()
    act(() => vi.advanceTimersByTime(1000))

    render(<Chip label="Второй" />)
    fireEvent.pointerEnter(screen.getByRole('button'), mouse)
    act(() => vi.advanceTimersByTime(0))

    expect(tooltip()).not.toBeInTheDocument()
  })
})

describe('Tooltip — truncatedOnly', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('PointerEvent', TestPointerEvent)
    // текст помещается целиком
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
  })

  afterEach(() => {
    act(() => vi.advanceTimersByTime(1000))
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('без флага показывает подсказку и у необрезанного триггера', () => {
    render(<Chip label="Закрыть" />)
    fireEvent.pointerEnter(screen.getByRole('button'), mouse)
    act(() => vi.advanceTimersByTime(400))

    expect(tooltip()).toHaveTextContent('Закрыть')
  })

  it('с флагом молчит, пока текст помещается', () => {
    render(
      <Chip
        label="Вариант 1"
        truncatedOnly
      />,
    )
    fireEvent.pointerEnter(screen.getByRole('button'), mouse)
    act(() => vi.advanceTimersByTime(400))

    expect(tooltip()).not.toBeInTheDocument()
  })
})
