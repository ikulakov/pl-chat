import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../../i18n'
import { fileItem } from '../../../shared/testUtils/matrixFixtures'
import type { BubbleMetaData } from './BubbleMeta'
import { FileChip } from './FileChip'

const cancelUpload = vi.fn()
const resendMessage = vi.fn()
const downloadFile = vi.fn(() => Promise.resolve(new Blob(['bytes'])))

vi.mock('../../../hooks/useChatActions', () => ({
  useChatActions: () => ({ cancelUpload, resendMessage, downloadFile }),
}))

const meta: BubbleMetaData = { ts: 0, own: true, sendStatus: 'sent', isRead: false }

describe('FileChip', () => {
  afterEach(() => {
    cancelUpload.mockClear()
    resendMessage.mockClear()
    downloadFile.mockClear()
  })

  it('показывает причину сбоя загрузки, только если она сорвалась — не когда упал сам /send', () => {
    // причина заполняется только при сорванной отдаче байт — падение /send диспатчит
    // message.failed без поля upload; по этому признаку компонент различает две причины failed
    const { rerender } = render(
      <FileChip
        item={fileItem({
          sendStatus: 'failed',
          upload: { file: new File([], 'doc.pdf'), pct: null, error: 'network' },
        })}
        meta={meta}
      />,
    )

    expect(screen.getByText(t('chat.upload.error'))).toBeInTheDocument()

    rerender(
      <FileChip
        item={fileItem({ sendStatus: 'failed' })}
        meta={meta}
      />,
    )

    expect(screen.queryByText(t('chat.upload.error'))).not.toBeInTheDocument()
    expect(screen.getByText('PDF')).toBeInTheDocument()
  })

  it('во время загрузки показывает процент вместо размера и даёт отменить, после — размер без кнопки отмены', () => {
    const { rerender } = render(
      <FileChip
        item={fileItem({
          sendStatus: 'sending',
          content: {
            body: '',
            url: '',
            filename: 'без-расширения',
            info: { mimetype: '', size: 2048 },
          },
          upload: { file: new File([], 'без-расширения'), pct: 40 },
        })}
        meta={meta}
      />,
    )

    expect(screen.getByText(t('composer.upload.progress', { percent: 40 }))).toBeInTheDocument()

    screen.getByRole('button', { name: t('chat.action.cancelUpload') }).click()
    expect(cancelUpload).toHaveBeenCalledExactlyOnceWith('m1')

    rerender(
      <FileChip
        item={fileItem({
          sendStatus: 'sent',
          content: {
            body: '',
            url: 'mxc://bank.ru/abc',
            filename: 'без-расширения',
            info: { mimetype: '', size: 2048 },
          },
        })}
        meta={meta}
      />,
    )

    expect(screen.getByText('2 КБ')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('chat.action.cancelUpload') }),
    ).not.toBeInTheDocument()
  })

  it('на время отдачи байт прячет спиннер отправки — прогресс уже показан кольцом', () => {
    const upload = { file: new File([], 'doc.pdf'), pct: 40 }
    const sending: BubbleMetaData = { ...meta, sendStatus: 'sending' }

    const { rerender } = render(
      <FileChip
        item={fileItem({ sendStatus: 'sending', upload })}
        meta={sending}
      />,
    )

    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    // upload снят редьюсером — байты доехали, пошёл PUT /send: теперь спиннер уместен
    rerender(
      <FileChip
        item={fileItem({ sendStatus: 'sending' })}
        meta={sending}
      />,
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('клик по чипу скачивает оригинал файла, а не превью', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(
      <FileChip
        item={fileItem({ sendStatus: 'sent' })}
        meta={meta}
      />,
    )

    await act(async () => {
      screen.getByRole('button', { name: t('chat.media.download', { name: 'doc.pdf' }) }).click()
    })

    expect(click).toHaveBeenCalledOnce()

    // без thumbnail в запросе — пользователю нужен сам файл, а не уменьшенная копия
    expect(downloadFile).toHaveBeenCalledWith('mxc://bank.ru/abc')
    click.mockRestore()
  })

  it('предлагает повтор при временном сбое и удаление — при отказе сервера', () => {
    const upload = { file: new File([], 'doc.pdf'), pct: null }
    const { rerender } = render(
      <FileChip
        item={fileItem({
          sendStatus: 'failed',
          upload: { ...upload, error: 'network' },
        })}
        meta={meta}
      />,
    )

    screen.getByRole('button', { name: t('chat.action.retryUpload') }).click()
    expect(resendMessage).toHaveBeenCalledExactlyOnceWith('m1')

    rerender(
      <FileChip
        item={fileItem({
          sendStatus: 'failed',
          // fileguard отклонил файл — повтор даст тот же ответ, остаётся убрать черновик
          upload: { ...upload, error: 'rejected' },
        })}
        meta={meta}
      />,
    )

    expect(
      screen.queryByRole('button', { name: t('chat.action.retryUpload') }),
    ).not.toBeInTheDocument()
    screen.getByRole('button', { name: t('chat.action.removeFile') }).click()
    expect(cancelUpload).toHaveBeenCalledExactlyOnceWith('m1')
  })
})
