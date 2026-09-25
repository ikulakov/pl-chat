import { MediaUnavailableError } from '@/domain/mediaFailure'
import { chatStore } from '@/store/store'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaSource } from './useMediaSource'

const loadPreview = vi.fn(() => Promise.resolve(new Blob(['bytes'])))

vi.mock<unknown>(import('@/hooks/useChatActions'), () => ({
  useChatActions: () => ({ loadPreview }),
}))

const SIZE = { width: 320, height: 240 }

describe('useMediaSource', () => {
  it('чужой вердикт не вызывает рендер, свой ready сохраняет загруженный object-URL', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const rendered = vi.fn()
    const { result } = renderHook(() => {
      rendered()
      return useMediaSource({ mxcUrl: 'mxc://bank.ru/abc', size: SIZE })
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const source = result.current
    rendered.mockClear()

    const ready = (mediaId: 'other' | 'abc') =>
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
            mediaVerdicts: [{ mediaId, verdict: { status: 'ready' } }],
          },
        })
      })

    ready('other')
    expect(rendered).not.toHaveBeenCalled()
    ready('abc')
    expect(result.current).toBe(source)
    expect(loadPreview).toHaveBeenCalledOnce()
    expect(revoke).not.toHaveBeenCalled()
  })

  it('при смене URL читает вердикт нового файла и не сохраняет отказ предыдущего', async () => {
    act(() =>
      chatStore.getState().dispatch({
        type: 'sync.received',
        cursor: 's1',
        room: {
          timeline: [],
          readMarkers: [],
          reactions: [],
          cardAnswers: [],
          prevBatch: null,
          mediaVerdicts: [{ mediaId: 'abc', verdict: { status: 'rejected' } }],
        },
      }),
    )
    const { result, rerender } = renderHook(
      ({ url }) => useMediaSource({ mxcUrl: url, size: SIZE }),
      { initialProps: { url: 'mxc://bank.ru/abc' } },
    )
    expect(result.current.status).toBe('rejected')
    expect(loadPreview).not.toHaveBeenCalled()
    rerender({ url: 'mxc://bank.ru/other' })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(loadPreview).toHaveBeenCalledExactlyOnceWith('mxc://bank.ru/other', SIZE)
  })

  afterEach(() => {
    loadPreview.mockReset()
    loadPreview.mockResolvedValue(new Blob(['bytes']))
    vi.restoreAllMocks()
    chatStore.getState().dispatch({ type: 'session.closed' })
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

  it('различает ожидание вердикта проверки и окончательный отказ', async () => {
    loadPreview.mockRejectedValueOnce(new MediaUnavailableError('pending'))
    const pending = renderHook(() => useMediaSource({ mxcUrl: 'mxc://bank.ru/abc', size: SIZE }))
    await waitFor(() => expect(pending.result.current.status).toBe('checking'))

    loadPreview.mockRejectedValueOnce(new MediaUnavailableError('rejected'))
    const gone = renderHook(() => useMediaSource({ mxcUrl: 'mxc://bank.ru/other', size: SIZE }))
    await waitFor(() => expect(gone.result.current.status).toBe('rejected'))
  })

  it('kc.media.status rejected отдаёт отказ без обращения к сети', async () => {
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

    const { result } = renderHook(() => useMediaSource({ mxcUrl: 'mxc://bank.ru/abc', size: SIZE }))

    await waitFor(() => expect(result.current.status).toBe('rejected'))
    expect(loadPreview).not.toHaveBeenCalled()
  })

  it('kc.media.status ready выводит из checking без действий пользователя', async () => {
    loadPreview.mockRejectedValueOnce(new MediaUnavailableError('pending'))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { result } = renderHook(() => useMediaSource({ mxcUrl: 'mxc://bank.ru/abc', size: SIZE }))
    await waitFor(() => expect(result.current.status).toBe('checking'))

    chatStore.getState().dispatch({
      type: 'sync.received',
      cursor: 's1',
      room: {
        timeline: [],
        readMarkers: [],
        reactions: [],
        cardAnswers: [],
        mediaVerdicts: [{ mediaId: 'abc', verdict: { status: 'ready' } }],
        prevBatch: null,
      },
    })

    await waitFor(() => expect(result.current).toEqual({ status: 'ready', url: 'blob:preview' }))
  })

  // Сеть и 5xx — не вердикт: картинку можно запросить снова, и повтор обязан уйти в сеть,
  // а не вернуть закэшированную ошибку.
  it('сетевой сбой отдаёт повтор, и повтор заново запрашивает превью', async () => {
    loadPreview.mockRejectedValueOnce(new MediaUnavailableError('failed'))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { result } = renderHook(() => useMediaSource({ mxcUrl: 'mxc://bank.ru/abc', size: SIZE }))
    await waitFor(() => expect(result.current.status).toBe('error'))

    const source = result.current
    if (source.status !== 'error') throw new Error('unreachable')
    act(() => source.retry())

    await waitFor(() => expect(result.current).toEqual({ status: 'ready', url: 'blob:preview' }))
    expect(loadPreview).toHaveBeenCalledTimes(2)
  })
})
