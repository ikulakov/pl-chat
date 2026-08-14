import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAnimationCache } from '../../shared/lottie/animationCache'
import { StickerView, type StickerViewData } from './StickerView'

const loadStickerAnimation = vi.fn()

vi.mock('../../hooks/useChatActions', () => ({
  useChatActions: () => ({ loadStickerAnimation }),
}))

// lottie-web тянет canvas, которого в jsdom нет; здесь проверяется выбор ветки, а не плеер.
vi.mock('../../shared/lottie/lottiePlayer', () => ({
  loadLottiePlayer: () => Promise.resolve({}),
  createEmojiPlayer: () => ({
    totalFrames: 30,
    frameRate: 30,
    goToAndStop: vi.fn(),
    destroy: vi.fn(),
  }),
}))

const SILHOUETTE = 'data:image/png;base64,iVBORw0KG'

function sticker(overrides: Partial<StickerViewData> = {}): StickerViewData {
  return {
    mediaId: 'AbCdEfGhIjKlMnOpQrStUvWx',
    body: '🩷',
    format: 'image',
    silhouette: SILHOUETTE,
    ...overrides,
  }
}

describe('StickerView', () => {
  beforeEach(() => {
    resetAnimationCache()
    loadStickerAnimation.mockResolvedValue({})
  })

  it('растровый стикер — обычная картинка с публичного адреса байтов', () => {
    const { container } = render(
      <StickerView
        sticker={sticker()}
        size={128}
      />,
    )

    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', '/_matrix/sticker/AbCdEfGhIjKlMnOpQrStUvWx')
    expect(container.querySelector('video')).not.toBeInTheDocument()
  })

  it('видео-стикер: muted и playsinline обязательны, иначе iOS не запустит автовоспроизведение', () => {
    const { container } = render(
      <StickerView
        sticker={sticker({ format: 'video' })}
        size={128}
      />,
    )

    const video = container.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('src', '/_matrix/sticker/AbCdEfGhIjKlMnOpQrStUvWx')
    expect(video).toHaveProperty('muted', true)
    expect(video).toHaveAttribute('playsinline')
    expect(video).toHaveAttribute('loop')
  })

  it('видео не играет само по себе: старт отдан наблюдателю видимости', () => {
    const { container } = render(
      <StickerView
        sticker={sticker({ format: 'video' })}
        size={128}
      />,
    )

    // autoplay нет намеренно — 20 декодеров разом положат CPU
    expect(container.querySelector('video')).not.toHaveAttribute('autoplay')
  })

  it('Lottie-стикер до готовности показывает силуэт, а не пустоту', () => {
    const { container } = render(
      <StickerView
        sticker={sticker({ format: 'lottie' })}
        size={128}
      />,
    )

    const mask = container.querySelector<HTMLElement>('[data-silhouette]')
    expect(mask?.style.getPropertyValue('--silhouette')).toContain(SILHOUETTE)
  })

  it('силуэт — маска, а не картинка: как <img> это чёрный квадрат на белом фоне', () => {
    const { container } = render(
      <StickerView
        sticker={sticker({ format: 'lottie' })}
        size={128}
      />,
    )

    expect(container.querySelector(`img[src="${SILHOUETTE}"]`)).not.toBeInTheDocument()
  })

  it('видео скрыто до первого кадра: пустое <video> браузер заливает чёрным', () => {
    const { container } = render(
      <StickerView
        sticker={sticker({ format: 'video' })}
        size={128}
      />,
    )

    const video = container.querySelector('video')
    expect(video).toHaveAttribute('preload', 'none')
    expect(video?.className).toMatch(/hidden/)
  })

  it('доступное имя — эмодзи-подпись стикера', () => {
    render(
      <StickerView
        sticker={sticker({ body: '🐼' })}
        size={72}
      />,
    )

    expect(screen.getByRole('img', { name: '🐼' })).toBeInTheDocument()
  })
})
