import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deferred, makeFile } from '../../shared/testUtils/matrixFixtures'
import { readImageDimensions, type ImageDimensions } from '../../shared/utils/imageDimensions'
import { useAttachmentState } from './useAttachmentState'

const sendFile = vi.fn()
vi.mock('../../hooks/useChatActions', () => ({
  useChatActions: () => ({ sendFile }),
}))

// jsdom не грузит <img> → readImageDimensions зависла бы. Мокаем интринсик-размеры.
vi.mock('../../shared/utils/imageDimensions', () => ({
  readImageDimensions: vi.fn().mockResolvedValue({ w: 800, h: 600 }),
}))

describe('useAttachmentState', () => {
  afterEach(() => {
    sendFile.mockReset()
  })

  it('отбракованный файл всё равно виден в композере — с причиной и без права на отправку', () => {
    const { result } = renderHook(() => useAttachmentState())

    act(() => result.current.pickFile(makeFile('evil.exe', 100)))

    expect(result.current.pending).toMatchObject({
      file: expect.any(File),
      error: 'Формат файла не поддерживается',
    })

    act(() => result.current.send())

    expect(sendFile).not.toHaveBeenCalled()
    // остаётся на месте: пользователь сам решает — убрать или заменить
    expect(result.current.pending).not.toBeNull()
  })

  it('accepts a whitelisted file as the pending attachment without touching the network', () => {
    const { result } = renderHook(() => useAttachmentState())

    act(() => result.current.pickFile(makeFile('doc.pdf', 100)))

    expect(result.current.pending?.file.name).toBe('doc.pdf')
    expect(result.current.pending?.error).toBeUndefined()
    // загрузка стартует только с отправкой — файл уезжает вместе с сообщением
    expect(sendFile).not.toHaveBeenCalled()
  })

  it('отправка ждёт размеры картинки, но композер освобождает сразу', async () => {
    // w/h обязаны уехать с событием: у получателя байтов ещё нет, и без размеров его лента
    // дёрнется, когда картинка догрузится. Декодирование начато при выборе, поэтому ожидание
    // в норме нулевое — здесь оно растянуто, чтобы проверить сам порядок.
    const decoding = deferred<ImageDimensions | null>()
    vi.mocked(readImageDimensions).mockReturnValueOnce(decoding.promise)
    sendFile.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAttachmentState())

    act(() => result.current.pickFile(makeFile('p.png', 100, 'image/png')))
    act(() => result.current.send())

    expect(result.current.pending).toBeNull()
    expect(sendFile).not.toHaveBeenCalled()

    decoding.resolve({ w: 800, h: 600 })

    await waitFor(() =>
      expect(sendFile).toHaveBeenCalledExactlyOnceWith(
        expect.any(File),
        expect.objectContaining({ dims: { w: 800, h: 600 } }),
      ),
    )
  })

  it('cancel clears the pending attachment', () => {
    const { result } = renderHook(() => useAttachmentState())

    act(() => result.current.pickFile(makeFile('doc.pdf', 100)))
    act(() => result.current.cancel())

    expect(result.current.pending).toBeNull()
  })

  it('send передаёт файл с подписью и сразу освобождает композер', () => {
    sendFile.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAttachmentState())

    act(() => result.current.pickFile(makeFile('doc.pdf', 100)))
    act(() => result.current.send({ caption: 'глядите договор' }))

    expect(sendFile).toHaveBeenCalledExactlyOnceWith(
      expect.any(File),
      expect.objectContaining({ caption: 'глядите договор' }),
    )
    // ждать загрузку композер не обязан: статус живёт на сообщении в ленте
    expect(result.current.pending).toBeNull()
  })
})
