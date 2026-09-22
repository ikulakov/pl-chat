import { afterEach, expect, it, vi } from 'vitest'
import { syncResponse } from '@/shared/testUtils/matrixFixtures'
import { createMatrixApi } from '../api/matrixApi'
import { MatrixTransport } from '../api/matrixTransport'
import { LocalStorageSessionStore } from './localStorageSessionStore'
import { MatrixSessionManager } from './sessionManager'

afterEach(() => vi.restoreAllMocks())

it('connects and resumes with refreshed credentials without re-registering when storage is denied', async () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('Access denied', 'SecurityError')
  })
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      Response.json({
        user_id: '@guest:bank',
        device_id: 'device',
        access_token: 'access',
        refresh_token: 'refresh',
      }),
    )
    .mockResolvedValueOnce(Response.json(syncResponse('s1')))
    .mockResolvedValueOnce(Response.json({ errcode: 'M_UNKNOWN_TOKEN' }, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ access_token: 'refreshed' }))
    .mockResolvedValueOnce(Response.json(syncResponse('s2')))
  const store = new LocalStorageSessionStore()
  const manager = new MatrixSessionManager(createMatrixApi(new MatrixTransport(store)), store)

  await expect(manager.establishSession()).resolves.toMatchObject({
    userId: '@guest:bank',
    cursor: 's1',
  })
  await expect(manager.establishSession()).resolves.toMatchObject({
    userId: '@guest:bank',
    cursor: 's2',
  })

  expect(fetchSpy).toHaveBeenCalledTimes(5)
  expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes('/register'))).toHaveLength(1)
  expect((fetchSpy.mock.calls[1]![1]!.headers as Headers).get('Authorization')).toBe(
    'Bearer access',
  )
  expect(JSON.parse(fetchSpy.mock.calls[3]![1]!.body as string)).toEqual({
    refresh_token: 'refresh',
  })
  expect((fetchSpy.mock.calls[4]![1]!.headers as Headers).get('Authorization')).toBe(
    'Bearer refreshed',
  )
  expect(store.getAccessToken()).toBe('refreshed')
  expect(store.getRefreshToken()).toBe('refresh')
})
