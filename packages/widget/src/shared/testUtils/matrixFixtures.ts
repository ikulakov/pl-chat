import { vi } from 'vitest'
import type { AdaptiveCardPayload } from '../../domain/adaptiveCards'
import type {
  AdaptiveCardTimelineItem,
  FileTimelineItem,
  ImageTimelineItem,
  MediaContent,
  SystemTimelineItem,
  TextTimelineItem,
} from '../../domain/timeline'
import type { MatrixApi } from '../../matrix/api/matrixApi'
import type { SessionInit } from '../../matrix/session/types'
import { MatrixEventType, MediaScanStatus, MsgType, OperatorStatus } from '../../matrix/wire/consts'
import type { MessagesResponse, SyncResponse } from '../../matrix/wire/dto'
import type {
  ClientEvent,
  EphemeralEvent,
  JoinedRoom,
  MediaStatusEvent,
  OperatorCurrentEvent,
  OperatorJoinedEvent,
  OperatorLeftEvent,
  RoomMessageEvent,
} from '../../matrix/wire/types'

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
    label: { source: 'literal', body: overrides.body ?? 'system' },
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
    label: { source: 'literal', body: overrides.body ?? 'notice' },
  }
}

export function fileItem(
  overrides: Partial<Omit<FileTimelineItem, 'kind' | 'content'>> & {
    body?: string
    content?: Partial<MediaContent>
  } = {},
): FileTimelineItem {
  const { body, content, ...rest } = overrides
  return {
    kind: 'file',
    localId: 'm1',
    eventId: '$m1',
    sender: OPERATOR_ID,
    ts: 0,
    sendStatus: 'sent',
    ...rest,
    content: {
      body: body ?? '',
      url: 'mxc://bank.ru/abc',
      filename: 'doc.pdf',
      info: { mimetype: 'application/pdf', size: 100 },
      ...content,
    },
  }
}

export function imageItem(
  overrides: Partial<Omit<ImageTimelineItem, 'kind' | 'content'>> & {
    body?: string
    content?: Partial<MediaContent>
  } = {},
): ImageTimelineItem {
  const { body, content, ...rest } = overrides
  return {
    kind: 'image',
    localId: 'm1',
    eventId: '$m1',
    sender: OPERATOR_ID,
    ts: 0,
    sendStatus: 'sent',
    ...rest,
    content: {
      body: body ?? '',
      url: 'mxc://bank.ru/abc',
      filename: 'p.png',
      info: { mimetype: 'image/png', size: 100 },
      ...content,
    },
  }
}

const DEFAULT_CARD: AdaptiveCardPayload = {
  type: 'AdaptiveCard',
  version: '1.5',
  actions: [
    { type: 'Action.Submit', id: 'confirm', title: 'Подтвердить', data: { action: 'confirm' } },
  ],
}

export function adaptiveCardItem(
  overrides: Partial<Omit<AdaptiveCardTimelineItem, 'kind' | 'content'>> & {
    body?: string
    card?: AdaptiveCardPayload
    cardKind?: string
  } = {},
): AdaptiveCardTimelineItem {
  const { body, card, cardKind, ...rest } = overrides
  return {
    kind: 'adaptiveCard',
    localId: 'm1',
    eventId: '$card',
    sender: OPERATOR_ID,
    ts: 0,
    sendStatus: 'sent',
    ...rest,
    content: {
      body: body ?? 'Карточка',
      card: card ?? DEFAULT_CARD,
      ...(cardKind ? { cardKind } : {}),
    },
  }
}

export function makeFile(name: string, size = 1, type = ''): File {
  // jsdom File: реальные байты не создаём — переопределяем size напрямую.
  const blob = new Blob([new Uint8Array(Math.min(size, 1024))], { type })
  return Object.defineProperty(new File([blob], name, { type }), 'size', { value: size })
}

export function receiptEvent(
  content: Record<string, { 'm.read'?: Record<string, { ts?: number }> }>,
): EphemeralEvent {
  return { type: 'm.receipt', content }
}

export function readReceipt(eventId: string, reader: string, ts = 1): EphemeralEvent {
  return receiptEvent({ [eventId]: { 'm.read': { [reader]: { ts } } } })
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

export const MEDIA_REJECT_REASON = 'Файл не прошёл проверку безопасности'

// Не привязано к event_id: бэкенд шлёт один вердикт на media_id, не на упоминание в сообщении.
export function mediaStatusEvent(
  overrides: Partial<MediaStatusEvent['content']> = {},
): MediaStatusEvent {
  const content: MediaStatusEvent['content'] = {
    media_id: 'AbCdEfGhIjKlMnOpQrStUvWx',
    status: MediaScanStatus.Rejected,
    ...overrides,
  }

  return {
    type: MatrixEventType.MediaStatus,
    event_id: '$media-status',
    sender: OPERATOR_ID,
    origin_server_ts: 3,
    // error приходит только при rejected — у ready поля нет вовсе
    content:
      content.status === MediaScanStatus.Rejected
        ? { ...content, error: content.error ?? MEDIA_REJECT_REASON }
        : content,
  }
}

export function syncResponse(next: string, room: JoinedRoom = emptyJoinedRoom()): SyncResponse {
  return { next_batch: next, rooms: { join: { [ROOM_ID]: room } } }
}

export function messagesResponse(
  chunk: ClientEvent[] = [],
  end?: string,
  start = 's100',
): MessagesResponse {
  return { chunk, start, ...(end !== undefined && { end }) }
}

export function makeMatrixApi(overrides: Partial<MatrixApi> = {}): MatrixApi {
  return {
    registerGuest: vi
      .fn<MatrixApi['registerGuest']>()
      .mockResolvedValue({ user_id: '@u:bank', device_id: 'd1', access_token: 'tok' }),
    initialSync: vi.fn<MatrixApi['initialSync']>().mockResolvedValue(syncResponse('s1')),
    // parks by default so sync-loop-driven tests stay deterministic unless overridden
    longPollSync: vi.fn<MatrixApi['longPollSync']>().mockReturnValue(new Promise<never>(() => {})),
    getRoomHistory: vi.fn<MatrixApi['getRoomHistory']>().mockResolvedValue(messagesResponse()),
    sendMessage: vi.fn<MatrixApi['sendMessage']>().mockResolvedValue({ event_id: '$real' }),
    uploadMedia: vi
      .fn<MatrixApi['uploadMedia']>()
      .mockResolvedValue({ content_uri: 'mxc://bank.ru/abc' }),
    downloadMedia: vi.fn<MatrixApi['downloadMedia']>().mockResolvedValue(new Blob(['bytes'])),
    getThumbnail: vi.fn<MatrixApi['getThumbnail']>().mockResolvedValue(new Blob(['thumb'])),
    sendReadReceipt: vi.fn<MatrixApi['sendReadReceipt']>().mockResolvedValue({}),
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
