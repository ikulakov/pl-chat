import type { ImageTimelineItem } from '@/domain/timeline'
import { t } from '@/i18n'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageContent } from './ImageContent'

const { mediaSource } = vi.hoisted(() => ({
  mediaSource: vi.fn(() => ({ status: 'ready', url: 'blob:preview' }) as unknown),
}))

vi.mock<unknown>(import('../../hooks/useMediaSource'), () => ({
  useMediaSource: () => mediaSource(),
}))

const cancelUpload = vi.fn()
const resendMessage = vi.fn()
// Не резолвится: тесту важен факт запроса, а не сохранение файла в jsdom.
const downloadFile = vi.fn(() => new Promise<Blob>(() => {}))

vi.mock<unknown>(import('@/hooks/useChatActions'), () => ({
  useChatActions: () => ({ cancelUpload, resendMessage, downloadFile }),
}))

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

describe('ImageContent', () => {
  afterEach(() => {
    mediaSource.mockReturnValue({ status: 'ready', url: 'blob:preview' })
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  // Редьюсер снимает upload сразу после заливки, а сервер до вердикта CDR файл ещё не отдаёт.
  // Если отпустить локальные байты в этот момент, своя картинка на всё время запроса
  // сменяется пустым фоном.
  it('держит локальное превью, пока не приехала серверная версия', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    mediaSource.mockReturnValue({ status: 'loading' })

    const { rerender } = render(
      <ImageContent item={imageItem({ upload: { file: new File([], 'photo.png'), pct: 0 } })} />,
    )

    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:local')

    // байты доехали — upload снят, но превью с сервера ещё в пути
    rerender(<ImageContent item={imageItem()} />)

    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:local')
    expect(revoke).not.toHaveBeenCalled()

    mediaSource.mockReturnValue({ status: 'ready', url: 'blob:preview' })
    rerender(<ImageContent item={imageItem()} />)

    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:preview')
    expect(revoke).toHaveBeenCalledWith('blob:local')
  })

  // Обратная сторона предыдущего теста: заглушка закрывает неизвестность, но не вердикт.
  // Иначе отбракованный CDR файл выглядел бы доставленным — до перезагрузки страницы,
  // после которой локальных байт уже нет и правда всплывает.
  it('снимает локальное превью, когда сервер отбраковал файл', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local')
    mediaSource.mockReturnValue({ status: 'loading' })

    const { rerender } = render(
      <ImageContent item={imageItem({ upload: { file: new File([], 'photo.png'), pct: 0 } })} />,
    )

    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:local')

    mediaSource.mockReturnValue({ status: 'rejected' })
    rerender(<ImageContent item={imageItem()} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(t('chat.media.rejected'))).toBeInTheDocument()
  })

  it('скачивание живёт только в кнопке — клик по самой картинке ничего не делает', async () => {
    const user = userEvent.setup()
    render(<ImageContent item={imageItem()} />)

    await user.click(screen.getByRole('img'))
    expect(downloadFile).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: t('chat.media.download', { name: 'photo.png' }) }),
    )
    expect(downloadFile).toHaveBeenCalledExactlyOnceWith('mxc://bank.ru/abc')
  })

  it('во время заливки предлагает отмену вместо скачивания', () => {
    render(
      <ImageContent
        item={imageItem({
          sendStatus: 'sending',
          upload: { file: new File([], 'photo.png'), pct: 40 },
        })}
      />,
    )

    expect(screen.getByRole('button', { name: t('chat.action.cancelUpload') })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('chat.media.download', { name: 'photo.png' }) }),
    ).not.toBeInTheDocument()
  })

  // Отказ fileguard'а детерминирован: повтор получил бы тот же ответ, поэтому на его месте
  // крестик, который убирает черновик. Скачивания нет ни в одном случае — на сервере файла нет.
  it.each([
    ['network', 'chat.action.retryUpload', resendMessage],
    ['rateLimited', 'chat.action.retryUpload', resendMessage],
    ['rejected', 'chat.action.removeFile', cancelUpload],
  ] as const)('сорванная заливка (%s) даёт одно действие на кадре — %s', (failure, key, action) => {
    render(
      <ImageContent
        item={imageItem({
          sendStatus: 'failed',
          upload: { file: new File([], 'photo.png'), pct: null, error: failure },
        })}
      />,
    )

    screen.getByRole('button', { name: t(key) }).click()

    expect(action).toHaveBeenCalledExactlyOnceWith('m1')
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  // Байты на сервере, упала только отправка события: повтор живёт в меню сообщения, и второе
  // действие на кадре читалось бы другой ошибкой. Скачивать ещё нечего — сообщения нет.
  it('при упавшем /send кадр не предлагает ни повтора, ни скачивания', () => {
    render(<ImageContent item={imageItem({ sendStatus: 'failed' })} />)

    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('превью, не приехавшее по сети, можно запросить ещё раз кликом по заглушке', () => {
    const retry = vi.fn()
    mediaSource.mockReturnValue({ status: 'error', retry })

    render(<ImageContent item={imageItem()} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    screen.getByRole('button', { name: t('chat.media.error') }).click()

    expect(retry).toHaveBeenCalledOnce()
  })
})
