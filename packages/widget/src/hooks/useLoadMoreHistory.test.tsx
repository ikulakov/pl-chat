import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimelineItem } from '../domain/timeline'
import { textItem } from '../shared/testUtils/matrixFixtures'
import { chatStore, INITIAL_ROOM_STATE } from '../store/store'
import { ITEM_ID_ATTR, useLoadMoreHistory } from './useLoadMoreHistory'

// Экшены дёргают ChatController → MatrixService, которые в этом тесте не поднимаются
const loadMoreHistory = vi.fn()
const stopLoadingHistory = vi.fn()
vi.mock('./useChatActions', () => ({
  useChatActions: () => ({ loadMoreHistory, stopLoadingHistory }),
}))

const VIEWPORT = 100
const ROW_HEIGHT = 100

interface RowSpec {
  id: string
  top: number
  height?: number
}

// Лента из четырёх рядов по экрану каждый: хватает, чтобы развести оба порога и мёртвую зону.
const ROWS: RowSpec[] = [
  { id: 'a', top: 0 },
  { id: 'b', top: 100 },
  { id: 'c', top: 200 },
  { id: 'd', top: 300 },
]
const SCROLL_HEIGHT = 400

function item(id: string): TimelineItem {
  return textItem({ localId: id, eventId: id, sender: '@op:bank', body: 'x', ts: 1 })
}

// jsdom не считает layout — размеры и offsetTop задаются вручную.
function setRows(container: HTMLElement, rows: RowSpec[]): void {
  container.replaceChildren()
  for (const { id, top, height } of rows) {
    const row = document.createElement('div')
    row.setAttribute(ITEM_ID_ATTR, id)
    Object.defineProperty(row, 'offsetTop', { value: top, configurable: true })
    Object.defineProperty(row, 'offsetHeight', { value: height ?? ROW_HEIGHT, configurable: true })
    container.append(row)
  }
}

function setScrollHeight(container: HTMLElement, value: number): void {
  Object.defineProperty(container, 'scrollHeight', { value, configurable: true })
}

function setup(rows: RowSpec[], scrollTop: number, scrollHeight: number) {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientHeight', { value: VIEWPORT, configurable: true })
  setScrollHeight(container, scrollHeight)
  setRows(container, rows)
  container.scrollTop = scrollTop

  const containerRef = { current: container }

  const view = renderHook(
    ({ timeline }: { timeline: TimelineItem[] }) => useLoadMoreHistory({ timeline, containerRef }),
    { initialProps: { timeline: rows.map((row) => item(row.id)) } },
  )

  loadMoreHistory.mockClear()
  stopLoadingHistory.mockClear()

  return { ...view, container }
}

function scrollTo(container: HTMLElement, top: number): void {
  container.scrollTop = top
  act(() => {
    container.dispatchEvent(new Event('scroll'))
  })
}

describe('useLoadMoreHistory', () => {
  beforeEach(() => {
    chatStore.setState({ room: INITIAL_ROOM_STATE })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('рвёт догрузку в том же scroll-событии', () => {
    // спиннер и запрос обязаны умереть вместе с жестом: пользователь ушёл от верха
    const { container } = setup(ROWS, 0, SCROLL_HEIGHT)

    scrollTo(container, 250) // за дальним порогом: 250 > 2 × VIEWPORT

    expect(stopLoadingHistory).toHaveBeenCalled()
  })

  it('в мёртвой зоне между порогами не рвёт и не стартует', () => {
    // гистерезис: иначе болтанка у одной границы убивала бы живые запросы пачками
    const { container } = setup(ROWS, 0, SCROLL_HEIGHT)

    scrollTo(container, 150) // VIEWPORT < 150 < 2 × VIEWPORT

    expect(loadMoreHistory).not.toHaveBeenCalled()
    expect(stopLoadingHistory).not.toHaveBeenCalled()
  })

  it('возвращается в зону упреждения — догрузка стартует сама, без внешнего триггера', () => {
    const { container } = setup(ROWS, 250, SCROLL_HEIGHT)

    scrollTo(container, 50) // ближе экрана к верху

    expect(loadMoreHistory).toHaveBeenCalled()
  })

  it('порог считается от первого ряда, а не от нуля scrollTop', () => {
    // над первым рядом есть отступ (margin у .dateSeparator) — без его вычитания порог смещён
    const offsetRows = ROWS.map((row) => ({ ...row, top: row.top + 40 }))
    const { container } = setup(offsetRows, 250, SCROLL_HEIGHT + 40)

    // 130 - 40 = 90 < VIEWPORT: в зоне. Без вычитания было бы 130 — мимо.
    scrollTo(container, 130)

    expect(loadMoreHistory).toHaveBeenCalled()
  })

  it('спиннер молчит, пока идёт догрузка, но пользователь не у верха', () => {
    // при ошибке бесконечный backoff держит isLoadingHistory секундами: спиннер прибит к верху
    // ленты и без этой развилки лез бы в глаза, когда пользователь в середине
    chatStore.setState({ room: { ...INITIAL_ROOM_STATE, isLoadingHistory: true } })
    const { container, result } = setup(ROWS, 250, SCROLL_HEIGHT)

    expect(result.current.showHistorySpinner).toBe(false)

    scrollTo(container, 0)

    expect(result.current.showHistorySpinner).toBe(true)
  })

  it('перезапускает догрузку, когда флаг качнулся, а ссылка timeline та же', () => {
    // страница без видимых событий: prepend — no-op для ленты, но settled качает флаг.
    // Без флага в deps цикл застрял бы на невидимой странице
    chatStore.setState({ room: { ...INITIAL_ROOM_STATE, isLoadingHistory: true } })
    setup(ROWS, 0, SCROLL_HEIGHT)

    act(() => {
      chatStore.setState({ room: { ...INITIAL_ROOM_STATE, isLoadingHistory: false } })
    })

    expect(loadMoreHistory).toHaveBeenCalled()
  })

  it('prepend удерживает позицию: ряд под курсором не уезжает', () => {
    // scrollTop 100 → якорь 'c' (первый ряд ниже кромки), он стоит ровно у верха вьюпорта
    const { container, rerender } = setup(
      [
        { id: 'b', top: 0 },
        { id: 'c', top: 100 },
        { id: 'd', top: 200 },
      ],
      100,
      300,
    )

    // приехала страница: 'a' встал сверху и сдвинул всех на свою высоту
    act(() => {
      setRows(container, [
        { id: 'a', top: 0 },
        { id: 'b', top: 100 },
        { id: 'c', top: 200 },
        { id: 'd', top: 300 },
      ])
      setScrollHeight(container, 400)
      rerender({ timeline: [item('a'), item('b'), item('c'), item('d')] })
    })

    // 'c' уехал 100 → 200, значит и scrollTop обязан подрасти на 100: ряд остался на месте
    expect(container.scrollTop).toBe(200)
  })

  it('якорем становится длинное сообщение, верх которого уже ушёл за кромку', () => {
    // курсор стоит ВНУТРИ 'b': ни один ряд не начинается ниже кромки,
    // и якорь «первый ряд ниже scrollTop» дал бы null → позиция после prepend уехала бы
    const { container, rerender } = setup(
      [
        { id: 'a', top: 0 },
        { id: 'b', top: 100, height: 400 },
      ],
      200,
      500,
    )

    act(() => {
      setRows(container, [
        { id: 'z', top: 0, height: 150 },
        { id: 'a', top: 150 },
        { id: 'b', top: 250, height: 400 },
      ])
      setScrollHeight(container, 650)
      rerender({ timeline: [item('z'), item('a'), item('b')] })
    })

    expect(container.scrollTop).toBe(350) // 'b' уехал на 150 — и курсор вместе с ним
  })

  it('у низа prepend держит низ, а не якорь', () => {
    // перевёрстку ПОД якорем (появился скроллбар → перенос строк) якорь бы не учёл,
    // и низ отъехал бы на десятки пикселей
    const { container, rerender } = setup(
      [
        { id: 'b', top: 0 },
        { id: 'c', top: 100 },
      ],
      100, // scrollHeight - clientHeight → стоим ровно у низа
      200,
    )

    act(() => {
      setRows(container, [
        { id: 'a', top: 0 },
        { id: 'b', top: 100 },
        { id: 'c', top: 200 },
      ])
      setScrollHeight(container, 300)
      rerender({ timeline: [item('a'), item('b'), item('c')] })
    })

    expect(container.scrollTop).toBe(200) // = новый scrollHeight - clientHeight
  })

  it('обрывает догрузку при размонтировании', () => {
    // панель закрыли → Activity размонтирует поддерево: летящий запрос не должен пережить компонент
    const { unmount } = setup(ROWS, 0, SCROLL_HEIGHT)

    unmount()

    expect(stopLoadingHistory).toHaveBeenCalled()
  })
})
