import { vi } from 'vitest'
import type { SystemTimelineItem, TextTimelineItem } from '../../domain/timeline'
import { MatrixEventType, MsgType, OperatorStatus } from '../../matrix/consts'
import type { SyncResponse } from '../../matrix/dto'
import type { MatrixApi } from '../../matrix/matrixApi'
import type { SessionInit } from '../../matrix/session/types'
import type {
  JoinedRoom,
  OperatorCurrentEvent,
  OperatorJoinedEvent,
  OperatorLeftEvent,
  RoomMessageEvent,
} from '../../matrix/types'

export const ROOM_ID = '!room:bank'
export const OPERATOR_ID = '@operator:bank'

export function textItem(
  overrides: Partial<Omit<TextTimelineItem, 'kind' | 'content'>> & { body?: string } = {},
): TextTimelineItem {
  const { body, ...rest } = overrides
  return {
    kind: 'text',
    localId: 'm1',
    eventId: 'm1',
    sender: OPERATOR_ID,
    ts: 0,
    sendStatus: 'sent',
    ...rest,
    content: { body: body ?? 'hello' },
  }
}

export function systemItem(
  overrides: { localId?: string; eventId?: string; ts?: number; body?: string } = {},
): SystemTimelineItem {
  return {
    kind: 'system',
    localId: overrides.localId ?? 'sys1',
    eventId: overrides.eventId ?? 'sys1',
    ts: overrides.ts ?? 0,
    content: { body: overrides.body ?? 'system' },
  }
}

export function noticeItem(
  overrides: { localId?: string; eventId?: string; ts?: number; body?: string } = {},
): SystemTimelineItem {
  return {
    kind: 'notice',
    localId: overrides.localId ?? 'notice1',
    eventId: overrides.eventId ?? 'notice1',
    ts: overrides.ts ?? 0,
    content: { body: overrides.body ?? 'notice' },
  }
}

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
    // content — дискриминированный union; фикстура собирает конкретный вариант вручную,
    // спред Partial<union> размывает msgtype до объединения литералов
    content: { msgtype: MsgType.Text, body: 'hello', ...content } as RoomMessageEvent['content'],
    ...rest,
  }
}

export function operatorJoinedEvent(
  overrides: Partial<OperatorJoinedEvent['content']> = {},
): OperatorJoinedEvent {
  return {
    type: MatrixEventType.OperatorJoined,
    event_id: '$op-joined',
    sender: OPERATOR_ID,
    origin_server_ts: 1,
    content: {
      operator_id: OPERATOR_ID,
      displayname: 'Ольга',
      role: 'human',
      ...overrides,
    },
  }
}

export function operatorLeftEvent(
  overrides: Partial<OperatorLeftEvent['content']> = {},
): OperatorLeftEvent {
  return {
    type: MatrixEventType.OperatorLeft,
    event_id: '$op-left',
    sender: OPERATOR_ID,
    origin_server_ts: 1,
    content: {
      operator_id: OPERATOR_ID,
      reason: 'completed',
      ...overrides,
    },
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
