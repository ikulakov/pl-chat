import { t } from '@/i18n'
import { fileItem } from '@/shared/testUtils/matrixFixtures'
import { chatStore } from '@/store/store'
import { act, render, screen } from '@testing-library/react'
import { Profiler } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileContent } from './FileContent'

const cancelUpload = vi.fn()
const resendMessage = vi.fn()
const downloadFile = vi.fn(() => Promise.resolve(new Blob(['bytes'])))

vi.mock<unknown>(import('@/hooks/useChatActions'), () => ({
  useChatActions: () => ({ cancelUpload, resendMessage, downloadFile }),
}))

describe('FileContent', () => {
  it('не обновляется из-за чужого вердикта, но применяет отказ своего файла после рендера', () => {
    const onRender = vi.fn()
    render(
      <Profiler
        id="file"
        onRender={onRender}
      >
        <FileContent item={fileItem()} />
      </Profiler>,
    )
    onRender.mockClear()

    const reject = (mediaId: 'other' | 'abc') =>
      act(() => {
        chatStore.getState().dispatch({
          type: 'sync.received',
          cursor: mediaId,
          room: {
            timeline: [],
            readMarkers: [],
            reactions: [],
            cardAnswers: [],
            prevBatch: null,
            mediaVerdicts: [{ mediaId, verdict: { status: 'rejected' } }],
          },
        })
      })

    reject('other')
    expect(onRender).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: t('chat.media.download', { name: 'doc.pdf' }) }),
    ).toBeEnabled()

    reject('abc')
    expect(onRender).toHaveBeenCalledOnce()
    expect(screen.getByText(t('chat.media.rejected'))).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('chat.media.download', { name: 'doc.pdf' }) }),
    ).not.toBeInTheDocument()
  })

  afterEach(() => {
    cancelUpload.mockClear()
    resendMessage.mockClear()
    downloadFile.mockClear()
    chatStore.getState().dispatch({ type: 'session.closed' })
  })

  it('показывает причину сбоя загрузки, только если она сорвалась — не когда упал сам /send', () => {
    // причина заполняется только при сорванной отдаче байт — падение /send диспатчит
    // message.failed без поля upload; по этому признаку компонент различает две причины failed
    const { rerender } = render(
      <FileContent
        item={fileItem({
          sendStatus: 'failed',
          upload: { file: new File([], 'doc.pdf'), pct: null, error: 'network' },
        })}
      />,
    )

    expect(screen.getByText(t('chat.upload.error'))).toBeInTheDocument()

    rerender(<FileContent item={fileItem({ sendStatus: 'failed' })} />)

    expect(screen.queryByText(t('chat.upload.error'))).not.toBeInTheDocument()
    expect(screen.getByText('PDF')).toBeInTheDocument()
    // свой неотправленный файл скачивать незачем, а повтор /send живёт в меню сообщения
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('во время загрузки показывает процент вместо размера и даёт отменить, после — размер без кнопки отмены', () => {
    const { rerender } = render(
      <FileContent
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
      />,
    )

    expect(screen.getByText(t('composer.upload.progress', { percent: 40 }))).toBeInTheDocument()

    screen.getByRole('button', { name: t('chat.action.cancelUpload') }).click()
    expect(cancelUpload).toHaveBeenCalledExactlyOnceWith('m1')

    rerender(
      <FileContent
        item={fileItem({
          sendStatus: 'sent',
          content: {
            body: '',
            url: 'mxc://bank.ru/abc',
            filename: 'без-расширения',
            info: { mimetype: '', size: 2048 },
          },
        })}
      />,
    )

    expect(screen.getByText('2 КБ')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('chat.action.cancelUpload') }),
    ).not.toBeInTheDocument()
  })

  it('клик по иконке скачивает оригинал файла, а не превью', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<FileContent item={fileItem({ sendStatus: 'sent' })} />)

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
      <FileContent
        item={fileItem({
          sendStatus: 'failed',
          upload: { ...upload, error: 'network' },
        })}
      />,
    )

    screen.getByRole('button', { name: t('chat.action.retryUpload') }).click()
    expect(resendMessage).toHaveBeenCalledExactlyOnceWith('m1')

    rerender(
      <FileContent
        item={fileItem({
          sendStatus: 'failed',
          // fileguard отклонил файл — повтор даст тот же ответ, остаётся убрать черновик
          upload: { ...upload, error: 'rejected' },
        })}
      />,
    )

    expect(
      screen.queryByRole('button', { name: t('chat.action.retryUpload') }),
    ).not.toBeInTheDocument()
    screen.getByRole('button', { name: t('chat.action.removeFile') }).click()
    expect(cancelUpload).toHaveBeenCalledExactlyOnceWith('m1')
  })

  it('kc.media.status rejected гасит чип и показывает свой текст вместо размера', () => {
    chatStore.getState().dispatch({
      type: 'sync.received',
      cursor: 's1',
      room: {
        timeline: [],
        readMarkers: [],
        reactions: [],
        cardAnswers: [],
        mediaVerdicts: [{ mediaId: 'abc', verdict: { status: 'rejected' } }],
        prevBatch: null,
      },
    })

    render(<FileContent item={fileItem({ sendStatus: 'sent' })} />)

    expect(screen.getByText(t('chat.media.rejected'))).toBeInTheDocument()
    expect(screen.queryByText('PDF')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('chat.media.download', { name: 'doc.pdf' }) }),
    ).not.toBeInTheDocument()
  })
})
