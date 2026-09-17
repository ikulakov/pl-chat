import { makeMatrixApi } from '@/shared/testUtils/matrixFixtures'
import { describe, expect, it, vi } from 'vitest'
import type { MatrixApi } from '../api/matrixApi'
import { MatrixError } from '../api/matrixError'
import { MatrixCatalog } from './matrixCatalog'

describe('MatrixCatalog — анимации эмодзи', () => {
  it('анимации эмодзи уезжают в сеть одной пачкой', async () => {
    const api = makeMatrixApi({
      getEmojiAnimations: vi.fn<MatrixApi['getEmojiAnimations']>().mockResolvedValue({
        version: 'v1',
        emoji: { '1f600': { nm: '1f600' }, '2764': { nm: '2764' } },
      }),
    })
    const catalog = new MatrixCatalog(api)

    const animations = await Promise.all([
      catalog.loadEmojiAnimation('1f600', 'v1'),
      catalog.loadEmojiAnimation('2764', 'v1'),
    ])

    expect(animations).toEqual([{ nm: '1f600' }, { nm: '2764' }])
    // Сетка пикера просит десятки анимаций в один кадр — они обязаны схлопнуться в один запрос.
    expect(api.getEmojiAnimations).toHaveBeenCalledExactlyOnceWith(['1f600', '2764'], 'v1')
    expect(api.getEmojiAnimation).not.toHaveBeenCalled()
  })

  it('сервер без батч-маршрута не ломает загрузку эмодзи', async () => {
    const api = makeMatrixApi({
      getEmojiAnimations: vi
        .fn<MatrixApi['getEmojiAnimations']>()
        .mockRejectedValue(new MatrixError('M_NOT_FOUND', 'no such route')),
      getEmojiAnimation: vi.fn<MatrixApi['getEmojiAnimation']>().mockResolvedValue({ nm: 'one' }),
    })
    const catalog = new MatrixCatalog(api)

    await expect(catalog.loadEmojiAnimation('1f600', 'v1')).resolves.toEqual({ nm: 'one' })
    expect(api.getEmojiAnimation).toHaveBeenCalledExactlyOnceWith('1f600', 'v1')
  })

  it('индекс пака запрашивается один раз и переживает параллельные вызовы', async () => {
    const api = makeMatrixApi()
    const catalog = new MatrixCatalog(api)

    await Promise.all([catalog.loadEmojiIndex(), catalog.loadEmojiIndex()])
    await catalog.loadEmojiIndex()

    expect(api.getEmojiPacks).toHaveBeenCalledOnce()
  })

  it('упавший запрос индекса не оседает в кэше — следующий вызов идёт в сеть заново', async () => {
    const api = makeMatrixApi({
      getEmojiPacks: vi
        .fn<MatrixApi['getEmojiPacks']>()
        .mockRejectedValueOnce(new MatrixError('M_UNKNOWN', 'boom'))
        .mockResolvedValue({ packs: [] }),
    })
    const catalog = new MatrixCatalog(api)

    await expect(catalog.loadEmojiIndex()).rejects.toThrow()
    await expect(catalog.loadEmojiIndex()).resolves.toBeDefined()
    expect(api.getEmojiPacks).toHaveBeenCalledTimes(2)
  })
})
