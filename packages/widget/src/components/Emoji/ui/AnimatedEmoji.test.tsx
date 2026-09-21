import { resetAnimationCache } from '../lottie/animationCache'
import type { AcquireOptions } from '../lottie/lottiePool'
import { FakeIntersectionObserver } from '@/shared/testUtils/intersectionObserver'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnimatedEmoji } from './AnimatedEmoji'

const destroy = vi.fn()
const player = { destroy }
const release = vi.fn()

const createEmojiPlayer = vi.fn(() => player)
const acquire = vi.fn((_player: unknown, _options?: AcquireOptions) => release)

/** Пул зовёт `onComplete`, когда одиночный прогон дошёл до последнего кадра. */
function finishPlayback(): void {
  const options = acquire.mock.calls.at(-1)?.[1]
  act(() => options?.onComplete?.())
}

vi.mock<unknown>(import('@/hooks/useChatActions'), () => {
  const actions = { loadEmojiAnimation: () => Promise.resolve({}) }
  return { useChatActions: () => actions }
})

vi.mock(import('../lottie/emojiBitmap'), () => ({
  getEmojiBitmap: () => Promise.resolve('data:image/png;base64,AAA'),
}))

vi.mock<unknown>(import('../lottie/lottiePlayer'), () => ({
  loadLottiePlayer: () => Promise.resolve({}),
  createEmojiPlayer: (...args: unknown[]) => createEmojiPlayer(...(args as [])),
}))

vi.mock<unknown>(import('../lottie/lottiePool'), () => ({
  lottiePool: { acquire: (player: unknown, options?: AcquireOptions) => acquire(player, options) },
}))

function becomeVisible(isVisible: boolean): void {
  act(() => FakeIntersectionObserver.instances.at(-1)?.trigger(isVisible))
}

function renderEmoji() {
  return render(
    <AnimatedEmoji
      char="😀"
      codepoint="1f600"
      version="mock-1"
      size={128}
    />,
  )
}

beforeEach(() => {
  FakeIntersectionObserver.instances.length = 0
  resetAnimationCache()
  vi.clearAllMocks()
})

describe('AnimatedEmoji', () => {
  it('вне вьюпорта показывает первый кадр и не создаёт плеер', async () => {
    const { container } = renderEmoji()

    becomeVisible(false)

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(createEmojiPlayer).not.toHaveBeenCalled()
  })

  it('во вьюпорте ставит плеер в общий пул, а при уходе снимает и уничтожает', async () => {
    renderEmoji()

    becomeVisible(true)
    await waitFor(() => expect(acquire).toHaveBeenCalledWith(player, expect.anything()))

    becomeVisible(false)
    // Оставленный в пуле или неуничтоженный плеер — утечка на каждое эмодзи в ленте.
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1))
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('заказывает у пула один прогон, а не бесконечный цикл', async () => {
    renderEmoji()

    becomeVisible(true)

    // Бесконечный цикл в ленте — ровно то, от чего уходили: сообщение мельтешит всё время,
    // пока видно.
    await waitFor(() =>
      expect(acquire).toHaveBeenCalledWith(player, expect.objectContaining({ loop: false })),
    )
  })

  it('после прогона повторяет анимацию по клику, но не поверх идущей', async () => {
    const user = userEvent.setup()
    renderEmoji()

    becomeVisible(true)
    await waitFor(() => expect(acquire).toHaveBeenCalledTimes(1))

    // Пока прогон идёт, клик ничего не делает: второй acquire тикал бы тот же плеер дважды.
    await user.click(screen.getByRole('img', { name: '😀' }))
    expect(acquire).toHaveBeenCalledTimes(1)

    finishPlayback()
    await user.click(screen.getByRole('img', { name: '😀' }))
    expect(acquire).toHaveBeenCalledTimes(2)
  })
})
