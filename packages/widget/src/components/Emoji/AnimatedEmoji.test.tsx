import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeIntersectionObserver } from '../../../test.setup'
import { resetAnimationCache } from '../../shared/lottie/animationCache'
import { AnimatedEmoji } from './AnimatedEmoji'

const destroy = vi.fn()
const player = { destroy }
const release = vi.fn()

const createEmojiPlayer = vi.fn(() => player)
const acquire = vi.fn(() => release)

vi.mock('../../hooks/useChatActions', () => {
  const actions = { loadEmojiAnimation: () => Promise.resolve({}) }
  return { useChatActions: () => actions }
})

vi.mock('../../shared/lottie/emojiBitmap', () => ({
  getEmojiBitmap: () => Promise.resolve('data:image/png;base64,AAA'),
}))

vi.mock('../../shared/lottie/lottiePlayer', () => ({
  loadLottiePlayer: () => Promise.resolve({}),
  createEmojiPlayer: (...args: unknown[]) => createEmojiPlayer(...(args as [])),
}))

vi.mock('../../shared/lottie/lottiePool', () => ({
  lottiePool: { acquire: (...args: unknown[]) => acquire(...(args as [])) },
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
    await waitFor(() => expect(acquire).toHaveBeenCalledWith(player))

    becomeVisible(false)
    // Оставленный в пуле или неуничтоженный плеер — утечка на каждое эмодзи в ленте.
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1))
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
