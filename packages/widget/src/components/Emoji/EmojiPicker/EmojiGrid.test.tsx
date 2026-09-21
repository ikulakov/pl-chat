import type { EmojiCategory } from '@/domain/emoji'
import type { LottieCache } from '@/shared/lottie/lottieCache'
import { FakeIntersectionObserver } from '@/shared/testUtils/intersectionObserver'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmojiGrid } from './EmojiGrid'

vi.mock<unknown>(import('./EmojiCell'), () => ({ EmojiCell: () => null }))

const pending: EmojiCategory = { id: 'faces', title: 'Faces', count: 3, items: null }

// Ссылки стабильные: новый объект на каждый рендер сам перезапустил бы эффект наблюдателя,
// и тест показывал бы своё же дрожание вместо проверяемого поведения.
const scrollRef = createRef<HTMLDivElement>()
const cache = { get: vi.fn(), size: 0, clear: vi.fn() } as unknown as LottieCache

function grid(version: string) {
  return (
    <EmojiGrid
      categories={[pending]}
      version={version}
      cache={cache}
      scrollRef={scrollRef}
      registerSection={vi.fn()}
      onLoadCategory={vi.fn()}
      onSelect={vi.fn()}
    />
  )
}

beforeEach(() => {
  FakeIntersectionObserver.instances.length = 0
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
})

describe('EmojiGrid', () => {
  /**
   * Наблюдатель незагруженной секции не отключается после срабатывания, а
   * `IntersectionObserver` не зовёт колбэк повторно, пока состояние пересечения не изменилось.
   * Поэтому после смены версии пака (состав обнулился) секция без перемонтирования больше
   * никогда не попросила бы свой состав — и оставалась бы пустой, пока пользователь не
   * прокрутит её из вида и обратно.
   */
  it('смена версии пака заводит наблюдателя заново для незагруженной секции', () => {
    const { rerender } = render(grid('v1'))
    expect(FakeIntersectionObserver.instances).toHaveLength(1)

    rerender(grid('v2'))

    expect(FakeIntersectionObserver.instances).toHaveLength(2)
  })

  it('та же версия наблюдателя не пересоздаёт — иначе он слал бы повторные запросы состава', () => {
    const { rerender } = render(grid('v1'))

    rerender(grid('v1'))

    expect(FakeIntersectionObserver.instances).toHaveLength(1)
  })
})
