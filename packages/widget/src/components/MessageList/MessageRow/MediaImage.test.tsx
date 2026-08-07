import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImageTimelineItem } from '../../../domain/timeline'
import { t } from '../../../i18n'
import { MediaImage } from './MediaImage'

const { mediaSource } = vi.hoisted(() => ({
  mediaSource: vi.fn(() => ({ status: 'ready', url: 'blob:preview' }) as unknown),
}))

vi.mock('./useMediaSource', () => ({ useMediaSource: () => mediaSource() }))

function imageItem(overrides: Partial<ImageTimelineItem> = {}): ImageTimelineItem {
  return {
    kind: 'image',
    localId: 'm1',
    eventId: '$1',
    sender: '@u:bank',
    ts: 0,
    sendStatus: 'sent',
    content: {
      body: '',
      url: 'mxc://bank.ru/abc',
      filename: 'photo.png',
      info: { mimetype: 'image/png', size: 1024 },
    },
    ...overrides,
  }
}

describe('MediaImage', () => {
  afterEach(() => {
    mediaSource.mockReturnValue({ status: 'ready', url: 'blob:preview' })
    vi.restoreAllMocks()
  })

  // Редьюсер снимает upload сразу после заливки, а сервер до вердикта CDR файл ещё не отдаёт.
  // Если отпустить локальные байты в этот момент, своя картинка на всё время запроса
  // сменяется пустым фоном.
  it('держит локальное превью, пока не приехала серверная версия', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    mediaSource.mockReturnValue({ status: 'loading' })

    const props = {
      pct: null,
      busy: false,
      onDownload: vi.fn(),
      onCancel: vi.fn(),
      onRetry: vi.fn(),
    }
    const { rerender } = render(
      <MediaImage
        item={imageItem({ upload: { file: new File([], 'photo.png'), pct: 0 } })}
        {...props}
      />,
    )

    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:local')

    // байты доехали — upload снят, но превью с сервера ещё в пути
    rerender(
      <MediaImage
        item={imageItem()}
        {...props}
      />,
    )

    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:local')
    expect(revoke).not.toHaveBeenCalled()

    mediaSource.mockReturnValue({ status: 'ready', url: 'blob:preview' })
    rerender(
      <MediaImage
        item={imageItem()}
        {...props}
      />,
    )

    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:preview')
    expect(revoke).toHaveBeenCalledWith('blob:local')
  })

  // Обратная сторона предыдущего теста: заглушка закрывает неизвестность, но не вердикт.
  // Иначе отбракованный CDR файл выглядел бы доставленным — до перезагрузки страницы,
  // после которой локальных байт уже нет и правда всплывает.
  it('снимает локальное превью, когда сервер отбраковал файл', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local')
    mediaSource.mockReturnValue({ status: 'loading' })

    const props = {
      pct: null,
      busy: false,
      onDownload: vi.fn(),
      onCancel: vi.fn(),
      onRetry: vi.fn(),
    }
    const { rerender } = render(
      <MediaImage
        item={imageItem({ upload: { file: new File([], 'photo.png'), pct: 0 } })}
        {...props}
      />,
    )

    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:local')

    mediaSource.mockReturnValue({ status: 'rejected' })
    rerender(
      <MediaImage
        item={imageItem()}
        {...props}
      />,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(t('chat.media.rejected'))).toBeInTheDocument()
  })

  it('скачивание живёт только в кнопке — клик по самой картинке ничего не делает', () => {
    const onDownload = vi.fn()

    render(
      <MediaImage
        item={imageItem()}
        pct={null}
        busy={false}
        onDownload={onDownload}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    screen.getByRole('img').click()
    expect(onDownload).not.toHaveBeenCalled()

    screen.getByRole('button', { name: t('chat.media.download', { name: 'photo.png' }) }).click()
    expect(onDownload).toHaveBeenCalledOnce()
  })

  it('во время заливки предлагает отмену вместо скачивания', () => {
    render(
      <MediaImage
        item={imageItem({
          sendStatus: 'sending',
          upload: { file: new File([], 'photo.png'), pct: 40 },
        })}
        pct={40}
        busy={false}
        onDownload={vi.fn()}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: t('chat.action.cancelUpload') })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('chat.media.download', { name: 'photo.png' }) }),
    ).not.toBeInTheDocument()
  })
})
