import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '../i18n'
import { ReplyPreview } from './ReplyPreview'

// lottie-web поднимает плеер, которого в jsdom нет; здесь проверяется разметка цитаты.
vi.mock('../shared/lottie/lottiePlayer', () => ({
  loadLottiePlayer: () => Promise.resolve({}),
  createEmojiPlayer: () => ({ goToAndStop: vi.fn(), destroy: vi.fn() }),
}))

describe('ReplyPreview', () => {
  it('без onClick — статичный блок, не кнопка (оригинал недоступен)', () => {
    render(
      <ReplyPreview
        author="Оля"
        text="вопрос"
      />,
    )

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('вопрос')).toBeInTheDocument()
  })

  it('с onClick — кнопка, клик делегирует переход к оригиналу', () => {
    const onClick = vi.fn()
    render(
      <ReplyPreview
        author="Оля"
        text="вопрос"
        onClick={onClick}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.reply.goToOriginal') }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('цитата стикера показывает сам стикер, а не его подпись шрифтом', () => {
    const { container } = render(
      <ReplyPreview
        author="Вы"
        text={t('chat.reply.sticker')}
        sticker={{ mediaId: 'AbCdEfGhIjKlMnOpQrStUvWx', body: '🐥', format: 'image' }}
      />,
    )

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/_matrix/sticker/AbCdEfGhIjKlMnOpQrStUvWx',
    )
    expect(screen.getByRole('img', { name: '🐥' })).toBeInTheDocument()
    expect(screen.getByText(t('chat.reply.sticker'))).toBeInTheDocument()
  })
})
