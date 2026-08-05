import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MatrixError } from '../../../matrix/api/matrixError'
import { useMediaSource } from './useMediaSource'

const loadPreview = vi.fn(() => Promise.resolve(new Blob(['bytes'])))

vi.mock('../../../hooks/useChatActions', () => ({
  useChatActions: () => ({ loadPreview }),
}))

const SIZE = { width: 320, height: 240 }

describe('useMediaSource', () => {
  afterEach(() => {
    loadPreview.mockReset()
    loadPreview.mockResolvedValue(new Blob(['bytes']))
    vi.restoreAllMocks()
  })

  // Байты переживают размонтирование в кэше контроллера, а object-URL — нет: его владелец
  // ровно один компонент, и не освободить его здесь означает течь на каждом ряду ленты.
  it('освобождает object-URL при размонтировании', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { result, unmount } = renderHook(() =>
      useMediaSource({ mxcUrl: 'mxc://bank.ru/abc', size: SIZE }),
    )

    await waitFor(() => expect(result.current).toEqual({ status: 'ready', url: 'blob:preview' }))
    unmount()

    expect(revoke).toHaveBeenCalledWith('blob:preview')
  })

  it('различает карантин CDR (504) и окончательный отказ (404)', async () => {
    loadPreview.mockRejectedValueOnce(
      new MatrixError('M_NOT_YET_UPLOADED', 'processing', undefined, 504),
    )
    const pending = renderHook(() => useMediaSource({ mxcUrl: 'mxc://bank.ru/abc', size: SIZE }))
    await waitFor(() => expect(pending.result.current.status).toBe('checking'))

    loadPreview.mockRejectedValueOnce(new MatrixError('M_NOT_FOUND', 'gone', undefined, 404))
    const gone = renderHook(() => useMediaSource({ mxcUrl: 'mxc://bank.ru/other', size: SIZE }))
    await waitFor(() => expect(gone.result.current.status).toBe('rejected'))
  })
})
