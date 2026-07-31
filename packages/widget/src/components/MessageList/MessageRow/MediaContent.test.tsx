import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FileTimelineItem } from '../../../domain/timeline'
import { t } from '../../../i18n'
import type { BubbleMetaData } from './BubbleMeta'
import { MediaContent } from './MediaContent'

const cancelUpload = vi.fn()

vi.mock('../../../hooks/useChatActions', () => ({
  useChatActions: () => ({ cancelUpload }),
}))

const meta: BubbleMetaData = { ts: 0, own: true, sendStatus: 'sent', isRead: false }

function fileItem(overrides: Partial<FileTimelineItem> = {}): FileTimelineItem {
  return {
    kind: 'file',
    localId: 'm1',
    eventId: '$m1',
    sender: '@user:bank',
    ts: 0,
    sendStatus: 'sent',
    content: {
      body: '',
      url: 'mxc://bank.ru/abc',
      filename: 'doc.pdf',
      info: { mimetype: 'application/pdf', size: 100 },
    },
    ...overrides,
  }
}

describe('MediaContent', () => {
  afterEach(() => {
    cancelUpload.mockClear()
  })

  it('показывает причину сбоя загрузки, только если она сорвалась — не когда упал сам /send', () => {
    // upload доживает до failed лишь при сорванной отдаче байт (message.uploaded снимает
    // его целиком) — по этому признаку компонент отличает две разные причины failed
    const { rerender } = render(
      <MediaContent
        item={fileItem({
          sendStatus: 'failed',
          upload: { file: new File([], 'doc.pdf'), pct: null },
        })}
        meta={meta}
      />,
    )

    expect(screen.getByText(t('chat.upload.error'))).toBeInTheDocument()

    rerender(
      <MediaContent
        item={fileItem({ sendStatus: 'failed' })}
        meta={meta}
      />,
    )

    expect(screen.queryByText(t('chat.upload.error'))).not.toBeInTheDocument()
    expect(screen.getByText('PDF')).toBeInTheDocument()
  })

  it('во время загрузки показывает процент вместо размера и даёт отменить, после — размер без кнопки отмены', () => {
    const { rerender } = render(
      <MediaContent
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
      <MediaContent
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
})
