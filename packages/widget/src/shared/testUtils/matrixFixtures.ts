import { vi } from 'vitest'
import { MatrixEventType, MsgType, OperatorStatus } from '../../matrix/consts'
import type { MatrixApi } from '../../matrix/matrixApi'
import type { SessionInit } from '../../matrix/session/types'
import type { JoinedRoom, OperatorCurrentEvent, RoomMessageEvent } from '../../types/matrix'
import type { SyncResponse } from '../../types/requests'

export const ROOM_ID = '!room:bank'
export const OPERATOR_ID = '@operator:bank'

export function emptyJoinedRoom(overrides: Partial<JoinedRoom> = {}): JoinedRoom {
  return {
    state: { events: [] },
    timeline: { events: [] },
    ...overrides,
  }
}

export function operatorCurrentEvent(
  overrides: Partial<OperatorCurrentEvent['content']> = {},
): OperatorCurrentEvent {
  return {
    type: MatrixEventType.OperatorCurrent,
    state_key: '',
    event_id: '$op',
    sender: OPERATOR_ID,
    origin_server_ts: 1,
    content: {
      status: OperatorStatus.Active,
      operator_id: OPERATOR_ID,
      displayname: 'Support',
      ...overrides,
    },
  }
}

export function roomMessageEvent(
  overrides: Partial<Omit<RoomMessageEvent, 'content'>> & {
    content?: Partial<RoomMessageEvent['content']>
  } = {},
): RoomMessageEvent {
  const { content, ...rest } = overrides
  return {
    type: MatrixEventType.RoomMessage,
    event_id: '$m1',
    sender: OPERATOR_ID,
    origin_server_ts: 2,
    content: { msgtype: MsgType.Text, body: 'hello', ...content },
    ...rest,
  }
}

export function syncResponse(next: string, room: JoinedRoom = emptyJoinedRoom()): SyncResponse {
  return { next_batch: next, rooms: { join: { [ROOM_ID]: room } } }
}

export function makeMatrixApi(overrides: Partial<MatrixApi> = {}): MatrixApi {
  return {
    registerGuest: vi
      .fn<MatrixApi['registerGuest']>()
      .mockResolvedValue({ user_id: '@u:bank', device_id: 'd1', access_token: 'tok' }),
    initialSync: vi.fn<MatrixApi['initialSync']>().mockResolvedValue(syncResponse('s1')),
    // parks by default so sync-loop-driven tests stay deterministic unless overridden
    longPollSync: vi.fn<MatrixApi['longPollSync']>().mockReturnValue(new Promise<never>(() => {})),
    sendMessage: vi.fn<MatrixApi['sendMessage']>().mockResolvedValue({ event_id: '$real' }),
    ...overrides,
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function createFakeTokenStore(
  accessToken: string | null = null,
  refreshToken: string | null = null,
  userId: string | null = null,
) {
  let accessTokenValue = accessToken
  let refreshTokenValue = refreshToken
  let userIdValue = userId

  return {
    setSession: vi.fn((session: SessionInit) => {
      accessTokenValue = session.accessToken
      refreshTokenValue = session.refreshToken
      userIdValue = session.userId
    }),
    setTokens: vi.fn((newAccessToken: string, newRefreshToken?: string) => {
      accessTokenValue = newAccessToken
      if (newRefreshToken != null) refreshTokenValue = newRefreshToken
    }),
    getAccessToken: () => accessTokenValue,
    getRefreshToken: () => refreshTokenValue,
    getUserId: () => userIdValue,
    clearSession: vi.fn(() => {
      accessTokenValue = null
      refreshTokenValue = null
      userIdValue = null
    }),
  }
}
