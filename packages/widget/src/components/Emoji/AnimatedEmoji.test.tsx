import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeIntersectionObserver } from '../../../test.setup'
import { AnimatedEmoji } from './AnimatedEmoji'

const destroy = vi.fn()
const player = { destroy }
const removeFromPool = vi.fn()

const createEmojiPlayer = vi.fn(() => Promise.resolve(player))
const playInPool = vi.fn(() => removeFromPool)

vi.mock('../../hooks/useChatActions', () => {
  const actions = { loadEmojiAnimation: () => Promise.resolve({}) }
  return { useChatActions: () => actions }
})

vi.mock('../../shared/lottie/emojiBitmap', () => ({
  getEmojiBitmap: () => Promise.resolve('data:image/png;base64,AAA'),
}))

vi.mock('../../shared/lottie/emojiPlayer', () => ({
  createEmojiPlayer: (...args: unknown[]) => createEmojiPlayer(...(args as [])),
}))

vi.mock('../../shared/lottie/lottiePool', () => ({
  playInPool: (...args: unknown[]) => playInPool(...(args as [])),
}))

function becomeVisible(isVisible: boolean): void {
  act(() => FakeIntersectionObserver.instances.at(-1)?.trigger(isVisible))
}

beforeEach(() => {
  FakeIntersectionObserver.instances.length = 0
  vi.clearAllMocks()
})

describe('AnimatedEmoji', () => {
  it('вне вьюпорта показывает первый кадр и не создаёт плеер', async () => {
    const { container } = render(
      <AnimatedEmoji
        char="😋"
        codepoint="1f60b"
        size={128}
      />,
    )

    becomeVisible(false)

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(createEmojiPlayer).not.toHaveBeenCalled()
  })

  it('во вьюпорте ставит плеер в общий пул, а при уходе снимает и уничтожает', async () => {
    render(
      <AnimatedEmoji
        char="😋"
        codepoint="1f60b"
        size={128}
      />,
    )

    becomeVisible(true)
    await waitFor(() => expect(playInPool).toHaveBeenCalledWith(player))

    becomeVisible(false)
    // Оставленный в пуле или неуничтоженный плеер — утечка на каждое эмодзи в ленте.
    await waitFor(() => expect(removeFromPool).toHaveBeenCalledTimes(1))
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
