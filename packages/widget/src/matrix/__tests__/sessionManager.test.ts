import { describe, expect, it, vi } from 'vitest'
import {
  createFakeTokenStore,
  makeMatrixApi,
  ROOM_ID,
  syncResponse,
} from '../../shared/testUtils/matrixFixtures'
import type { MatrixApi } from '../matrixApi'
import { MatrixSessionManager } from '../session/sessionManager'
import { MatrixError } from '../transport/matrixError'

vi.mock('../../shared/sleep', () => ({ sleep: () => Promise.resolve() }))

function makeApi(overrides: Partial<MatrixApi> = {}): MatrixApi {
  return makeMatrixApi({
    registerGuest: vi.fn<MatrixApi['registerGuest']>().mockResolvedValue({
      user_id: '@new:bank',
      device_id: 'd1',
      access_token: 'new-token',
      refresh_token: 'new-refresh',
    }),
    initialSync: vi.fn<MatrixApi['initialSync']>().mockResolvedValue(syncResponse('s1')),
    ...overrides,
  })
}

describe('MatrixSessionManager — resuming an existing session', () => {
  it('resumes an existing session using the persisted userId, without re-registering', async () => {
    const api = makeApi()
    const sessionStore = createFakeTokenStore('token', 'refresh', '@old:bank')
    const manager = new MatrixSessionManager(api, sessionStore)

    const session = await manager.establishSession()

    expect(session.userId).toBe('@old:bank')
    expect(api.registerGuest).not.toHaveBeenCalled()
    expect(sessionStore.clearSession).not.toHaveBeenCalled()
  })

  it('falls back to guest registration when a token is present but no userId is persisted', async () => {
    // e.g. a pre-migration storage record — nothing to resume from.
    const api = makeApi()
    const sessionStore = createFakeTokenStore('token', 'refresh', null)
    const manager = new MatrixSessionManager(api, sessionStore)

    const session = await manager.establishSession()

    expect(api.registerGuest).toHaveBeenCalledOnce()
    expect(session.userId).toBe('@new:bank')
    expect(sessionStore.setSession).toHaveBeenCalledWith({
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
      userId: '@new:bank',
    })
  })

  it('does not clear tokens when resume fails with a non-auth error', async () => {
    const api = makeApi({
      initialSync: vi.fn<MatrixApi['initialSync']>().mockRejectedValue(new TypeError('network')),
    })
    const sessionStore = createFakeTokenStore('token', 'refresh', '@old:bank')
    const manager = new MatrixSessionManager(api, sessionStore)

    await expect(manager.establishSession()).rejects.toThrow('network')

    expect(sessionStore.clearSession).not.toHaveBeenCalled()
    expect(api.registerGuest).not.toHaveBeenCalled()
  })

  it('clears tokens and registers a new guest after an auth error', async () => {
    const api = makeApi({
      initialSync: vi
        .fn<MatrixApi['initialSync']>()
        .mockRejectedValueOnce(new MatrixError('M_UNKNOWN_TOKEN', 'expired'))
        .mockResolvedValue(syncResponse('s1')),
    })
    const sessionStore = createFakeTokenStore('token', 'refresh', '@old:bank')
    const manager = new MatrixSessionManager(api, sessionStore)

    const session = await manager.establishSession()

    expect(sessionStore.clearSession).toHaveBeenCalledOnce()
    expect(api.registerGuest).toHaveBeenCalledOnce()
    expect(session.userId).toBe('@new:bank')
  })

  it('does not clear a valid token when resume succeeds but the support room is momentarily missing from sync', async () => {
    // The persisted userId is present — a missing room here is a sync/backend
    // timing race, not an auth failure, and must not be treated as one.
    const api = makeApi({
      initialSync: vi.fn<MatrixApi['initialSync']>().mockResolvedValue({
        next_batch: 's1',
        rooms: { join: {} },
      }),
    })
    const sessionStore = createFakeTokenStore('token', 'refresh', '@old:bank')
    const manager = new MatrixSessionManager(api, sessionStore)

    await expect(manager.establishSession()).rejects.toMatchObject({ errcode: 'M_ROOM_NOT_FOUND' })

    expect(sessionStore.clearSession).not.toHaveBeenCalled()
    expect(api.registerGuest).not.toHaveBeenCalled()
  })
})

describe('MatrixSessionManager — guest registration', () => {
  it('registers a guest, saves tokens and the userId, and returns the support-room session', async () => {
    const api = makeMatrixApi({
      registerGuest: vi
        .fn<MatrixApi['registerGuest']>()
        .mockResolvedValue({ user_id: '@u:bank', device_id: 'd1', access_token: 'tok' }),
    })
    const sessionStore = createFakeTokenStore()
    const manager = new MatrixSessionManager(api, sessionStore)

    const session = await manager.establishSession()

    expect(session.userId).toBe('@u:bank')
    expect(session.roomId).toBe(ROOM_ID)
    expect(session.cursor).toBe('s1')
    expect(session.initialRoom).toBeDefined()
    expect(sessionStore.getAccessToken()).toBe('tok')
    expect(sessionStore.getUserId()).toBe('@u:bank')
  })

  it('fails when initial sync does not contain the support room even after retrying', async () => {
    const api = makeMatrixApi({
      initialSync: vi
        .fn<MatrixApi['initialSync']>()
        .mockResolvedValue({ next_batch: 's1', rooms: { join: {} } }),
    })
    const sessionStore = createFakeTokenStore()
    const manager = new MatrixSessionManager(api, sessionStore)

    await expect(manager.establishSession()).rejects.toMatchObject({
      errcode: 'M_ROOM_NOT_FOUND',
    })

    expect(sessionStore.getAccessToken()).toBeNull()
    expect(api.initialSync).toHaveBeenCalledTimes(3)
  })

  it('retries initialSync briefly when the freshly-registered room is not yet visible (writer async lag), then succeeds', async () => {
    let calls = 0
    const api = makeMatrixApi({
      registerGuest: vi
        .fn<MatrixApi['registerGuest']>()
        .mockResolvedValue({ user_id: '@u:bank', device_id: 'd1', access_token: 'tok' }),
      initialSync: vi.fn<MatrixApi['initialSync']>().mockImplementation(async () => {
        calls += 1
        // Room row exists but its m.room.member events haven't been written by the
        // writer module yet — the first attempt(s) see an empty rooms.join.
        return calls < 3 ? { next_batch: 's1', rooms: { join: {} } } : syncResponse('s1')
      }),
    })
    const sessionStore = createFakeTokenStore()
    const manager = new MatrixSessionManager(api, sessionStore)

    const session = await manager.establishSession()

    expect(session.roomId).toBe(ROOM_ID)
    expect(api.initialSync).toHaveBeenCalledTimes(3)
    expect(sessionStore.getAccessToken()).toBe('tok')
  })
})
