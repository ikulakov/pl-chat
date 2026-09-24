import { t } from '@/i18n'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReplyPreview } from './ReplyPreview'

// lottie-web поднимает плеер, которого в jsdom нет; здесь проверяется разметка цитаты.
vi.mock<unknown>(import('../../Emoji/lottie/lottiePlayer'), () => ({
  loadLottiePlayer: () => Promise.resolve({}),
  createLottieAnimation: () => ({ goToAndStop: vi.fn(), destroy: vi.fn() }),
}))

describe('ReplyPreview', () => {
  it.each([{}, { onNavigate: vi.fn() }, { targetId: 'parent-local' }])(
    'без цели или обработчика перехода — статичный блок: %o',
    ({ onNavigate, ...replyFields }) => {
      render(
        <ReplyPreview
          reply={{ author: 'Оля', text: 'вопрос', ...replyFields }}
          onNavigate={onNavigate}
        />,
      )

      expect(screen.queryByRole('button')).toBeNull()
      expect(screen.getByText('вопрос')).toBeInTheDocument()
    },
  )

  it('клик делегирует переход к оригиналу с его localId', () => {
    const onNavigate = vi.fn()
    render(
      <ReplyPreview
        reply={{ author: 'Оля', text: 'вопрос', targetId: 'parent-local' }}
        onNavigate={onNavigate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.reply.goToOriginal') }))

    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('parent-local')
  })

  it('цитата стикера показывает сам стикер, а не его подпись шрифтом', () => {
    const { container } = render(
      <ReplyPreview
        reply={{
          author: 'Вы',
          text: t('chat.reply.sticker'),
          sticker: {
            mediaId: 'AbCdEfGhIjKlMnOpQrStUvWx',
            bytesUrl: '/_matrix/sticker/AbCdEfGhIjKlMnOpQrStUvWx',
            body: '🐥',
            format: 'image',
          },
        }}
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
