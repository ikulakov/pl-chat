import { describe, expect, it, vi } from 'vitest'
import { startGuestSession } from '../helpers'
import type { MatrixApi } from '../matrixApi'

vi.mock('../httpClient', () => ({ setAccessToken: vi.fn() }))

function makeApi(over: Partial<MatrixApi> = {}): MatrixApi {
  return {
    registerGuest: vi
      .fn<MatrixApi['registerGuest']>()
      .mockResolvedValue({ user_id: '@u:bank', device_id: 'd1', access_token: 'tok' }),
    initialSync: vi.fn<MatrixApi['initialSync']>().mockResolvedValue({
      next_batch: 's1',
      rooms: { join: { '!r:bank': { state: { events: [] }, timeline: { events: [] } } } },
    }),
    longPollSync: vi.fn<MatrixApi['longPollSync']>().mockReturnValue(new Promise<never>(() => {})),
    sendMessage: vi.fn<MatrixApi['sendMessage']>().mockResolvedValue({ event_id: '$x' }),
    ...over,
  }
}

describe('startGuestSession', () => {
  it('registers a guest and returns the support-room session', async () => {
    const api = makeApi()

    const session = await startGuestSession(api)

    expect(session.userId).toBe('@u:bank')
    expect(session.roomId).toBe('!r:bank')
    expect(session.cursor).toBe('s1')
    expect(session.initialRoom).toBeDefined()
  })

  it('throws when no support room is present', async () => {
    const api = makeApi({
      initialSync: vi
        .fn<MatrixApi['initialSync']>()
        .mockResolvedValue({ next_batch: 's1', rooms: { join: {} } }),
    })

    await expect(startGuestSession(api)).rejects.toThrow('support_room_not_found')
  })
})
