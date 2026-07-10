import { describe, expect, it, vi } from 'vitest'
import type { ChatRuntimeState, Identity, RoomState, RuntimeAction } from '../store/state'
import type { TextTimelineItem } from '../domain/timeline'
import { INITIAL_RUNTIME_STATE } from '../store/store'
import {
  createFakeTokenStore,
  deferred,
  makeMatrixApi,
  syncResponse,
  textItem,
} from '../shared/testUtils/matrixFixtures'
import type { MatrixApi } from './matrixApi'
import { CONNECTION_FAILED_ERROR, MatrixController } from './matrixController'
import { MatrixSessionManager } from './session/sessionManager'
import { MatrixError } from './transport/matrixError'

vi.mock('../shared/sleep', () => ({ sleep: () => Promise.resolve() }))

const IDENTITY: Identity = { userId: '@u:bank', roomId: '!r:bank' }

// Контролируемый снимок стора + спай на apply — проверяем, какие доменные
// действия контроллер диспетчит (стор реальный не подключаем).
function harness(initial: Partial<ChatRuntimeState> = {}, api: MatrixApi = makeMatrixApi()) {
  const tokens = createFakeTokenStore()
  const state: ChatRuntimeState = { ...INITIAL_RUNTIME_STATE, ...initial }
  const applied: RuntimeAction[] = []
  const dispatch = vi.fn((action: RuntimeAction) => {
    applied.push(action)
  })
  const sessionManager = new MatrixSessionManager(api, tokens)
  const controller = new MatrixController({ dispatch, getState: () => state, api, sessionManager })
  return { controller, dispatch, applied, tokens }
}

// Общая форма "неудачно отправленного" сообщения для resendMessage-тестов ниже
function failedMessage(
  overrides: Partial<Omit<TextTimelineItem, 'kind' | 'content'>> & { body?: string } = {},
): TextTimelineItem {
  return textItem({
    localId: 'local-1',
    eventId: 'optimistic:local-1',
    sender: IDENTITY.userId,
    body: 'hi',
    ts: 1,
    sendStatus: 'failed',
    ...overrides,
  })
}

function roomWithMessage(message: TextTimelineItem): RoomState {
  return {
    timeline: [message],
    operator: { isActive: false, id: null, displayName: null },
  }
}

describe('MatrixController (orchestrator)', () => {
  it('connect dispatches connecting then session.started', async () => {
    const { controller, applied } = harness()

    await controller.connect()
    controller.disconnect()

    expect(applied[0]).toEqual({ type: 'connection.connecting' })
    expect(applied[1]!.type).toBe('session.started')
  })

  it('connect failure dispatches connection.failed', async () => {
    const { controller, applied } = harness(
      {},
      makeMatrixApi({
        registerGuest: vi.fn<MatrixApi['registerGuest']>().mockRejectedValue(new Error('net')),
      }),
    )

    await controller.connect()

    expect(applied.at(-1)).toEqual({
      type: 'connection.failed',
      error: CONNECTION_FAILED_ERROR,
    })
  })

  it('does not connect when already connected', async () => {
    const api = makeMatrixApi()
    const { controller } = harness({ phase: 'connected' }, api)

    await controller.connect()

    expect(api.registerGuest).not.toHaveBeenCalled()
  })

  it('does not connect again while a connect attempt is already in flight', async () => {
    const api = makeMatrixApi()
    const { controller } = harness({ phase: 'connecting' }, api)

    await controller.connect()

    expect(api.registerGuest).not.toHaveBeenCalled()
  })

  it('reconnect (connect from error phase) re-establishes the session', async () => {
    // Это ровно тот guard, на который опирается кнопка reconnect в UI: connect()
    // должен пропускать вызов из phase 'error', а не только из 'idle'.
    const { controller, applied } = harness({ phase: 'error', error: 'Не удалось подключиться' })

    await controller.connect()
    controller.disconnect()

    expect(applied[0]).toEqual({ type: 'connection.connecting' })
    expect(applied.some((action) => action.type === 'session.started')).toBe(true)
  })

  it('does not start a session when disconnected during initial connect', async () => {
    const initialSync = deferred<Awaited<ReturnType<MatrixApi['initialSync']>>>()
    const api = makeMatrixApi({
      initialSync: vi.fn<MatrixApi['initialSync']>().mockReturnValue(initialSync.promise),
    })
    const { controller, applied } = harness({}, api)

    const connect = controller.connect()
    await vi.waitFor(() => expect(api.initialSync).toHaveBeenCalledOnce())

    controller.disconnect()
    initialSync.resolve(syncResponse('s0'))
    await connect

    expect(applied.filter((action) => action.type === 'session.started')).toHaveLength(0)
    expect(api.longPollSync).not.toHaveBeenCalled()
  })

  it('re-registers a guest when sync auth refresh fails', async () => {
    const api = makeMatrixApi()
    let syncCalls = 0
    vi.mocked(api.longPollSync).mockImplementation(async () => {
      syncCalls += 1
      if (syncCalls === 1) {
        throw new MatrixError('M_UNKNOWN_TOKEN', 'expired')
      }
      return new Promise<never>(() => {})
    })
    const { controller, applied } = harness({}, api)

    await controller.connect()
    await vi.waitFor(() =>
      expect(applied.filter((action) => action.type === 'session.started')).toHaveLength(2),
    )
    controller.disconnect()

    expect(api.registerGuest).toHaveBeenCalledTimes(2)
    expect(applied.some((action) => action.type === 'connection.failed')).toBe(false)
    expect(applied.some((action) => action.type === 'session.recovering')).toBe(true)
  })

  it('stops and clears tokens when sync reports a deactivated user', async () => {
    const api = makeMatrixApi({
      registerGuest: vi.fn<MatrixApi['registerGuest']>().mockResolvedValue({
        user_id: '@u:bank',
        device_id: 'd1',
        access_token: 'tok',
        refresh_token: 'refresh',
      }),
    })
    vi.mocked(api.longPollSync).mockRejectedValue(new MatrixError('M_USER_DEACTIVATED', 'disabled'))
    const { controller, applied, tokens } = harness({}, api)

    await controller.connect()
    await vi.waitFor(() =>
      expect(applied).toContainEqual({
        type: 'connection.failed',
        error: CONNECTION_FAILED_ERROR,
      }),
    )

    expect(api.registerGuest).toHaveBeenCalledOnce()
    expect(tokens.getAccessToken()).toBeNull()
    expect(tokens.getRefreshToken()).toBeNull()
  })

  it('clears tokens when resuming a deactivated account, without re-registering a new guest', async () => {
    const api = makeMatrixApi({
      initialSync: vi
        .fn<MatrixApi['initialSync']>()
        .mockRejectedValue(new MatrixError('M_USER_DEACTIVATED', 'disabled')),
    })
    const { controller, applied, tokens } = harness({}, api)
    tokens.setSession({
      accessToken: 'stale-token',
      refreshToken: 'stale-refresh',
      userId: '@old:bank',
    })

    await controller.connect()

    expect(applied.at(-1)).toEqual({
      type: 'connection.failed',
      error: CONNECTION_FAILED_ERROR,
    })
    // Deactivation must not be silently worked around by registering a fresh guest —
    // that would defeat the server-side block.
    expect(api.registerGuest).not.toHaveBeenCalled()
    expect(tokens.getAccessToken()).toBeNull()
    expect(tokens.getRefreshToken()).toBeNull()
  })

  it('ignores stale auth recovery after disconnect and reconnect', async () => {
    const staleRecoverySync = deferred<Awaited<ReturnType<MatrixApi['initialSync']>>>()
    const api = makeMatrixApi()
    vi.mocked(api.initialSync)
      .mockResolvedValueOnce(syncResponse('s0'))
      .mockReturnValueOnce(staleRecoverySync.promise)
      .mockResolvedValueOnce(syncResponse('s1'))

    let syncCalls = 0
    vi.mocked(api.longPollSync).mockImplementation(async () => {
      syncCalls += 1
      if (syncCalls === 1) {
        throw new MatrixError('M_UNKNOWN_TOKEN', 'expired')
      }
      return new Promise<never>(() => {})
    })
    const { controller, applied } = harness({}, api)

    await controller.connect()
    await vi.waitFor(() => expect(api.initialSync).toHaveBeenCalledTimes(2))

    controller.disconnect()
    await controller.connect()

    staleRecoverySync.resolve(syncResponse('stale'))
    await vi.waitFor(() =>
      expect(applied.filter((action) => action.type === 'session.started')).toHaveLength(2),
    )
    controller.disconnect()

    expect(applied.filter((action) => action.type === 'session.started')).toHaveLength(2)
    expect(applied.some((action) => action.type === 'connection.failed')).toBe(false)
  })

  it('fails connection when initial sync does not contain a support room', async () => {
    const api = makeMatrixApi({
      initialSync: vi
        .fn<MatrixApi['initialSync']>()
        .mockResolvedValue({ next_batch: 's0', rooms: { join: {} } }),
    })
    const { controller, applied } = harness({}, api)

    await controller.connect()

    expect(applied).toContainEqual({
      type: 'connection.failed',
      error: 'Не удалось подключиться',
    })
    expect(api.longPollSync).not.toHaveBeenCalled()
  })

  it('sendMessage dispatches optimisticAdded then sent', async () => {
    const { controller, applied } = harness({
      phase: 'connected',
      identity: IDENTITY,
    })

    await controller.sendMessage('hi')

    expect(applied[0]!.type).toBe('message.optimisticAdded')
    expect(applied[1]).toEqual({
      type: 'message.sent',
      localId: expect.any(String),
      eventId: '$real',
    })
  })

  it('sendMessage without identity does nothing', async () => {
    const { controller, dispatch } = harness()

    await controller.sendMessage('hi')

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('sendMessage does nothing when phase is not connected, even with a stale identity', async () => {
    const { controller, dispatch } = harness({
      phase: 'connecting',
      identity: IDENTITY,
    })

    await controller.sendMessage('hi')

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('sendMessage triggers session recovery when the send itself hits an auth error', async () => {
    const api = makeMatrixApi({
      sendMessage: vi
        .fn<MatrixApi['sendMessage']>()
        .mockRejectedValue(new MatrixError('M_UNKNOWN_TOKEN', 'expired')),
    })
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendMessage('hi')

    expect(applied).toContainEqual({ type: 'message.failed', localId: expect.any(String) })
    await vi.waitFor(() => expect(api.registerGuest).toHaveBeenCalledOnce())
    await vi.waitFor(() =>
      expect(applied.filter((action) => action.type === 'session.started')).toHaveLength(1),
    )
    expect(applied).toContainEqual({ type: 'session.recovering' })
    controller.disconnect()
  })

  it('deduplicates session recovery when sync and send hit auth errors together', async () => {
    const recoverySync = deferred<Awaited<ReturnType<MatrixApi['initialSync']>>>()
    const api = makeMatrixApi({
      initialSync: vi.fn<MatrixApi['initialSync']>().mockReturnValue(recoverySync.promise),
      sendMessage: vi
        .fn<MatrixApi['sendMessage']>()
        .mockRejectedValue(new MatrixError('M_UNKNOWN_TOKEN', 'expired')),
    })
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)
    const handleSyncError = (
      controller as unknown as {
        handleSyncError: (err: unknown, meta: { backoff: number }) => void
      }
    ).handleSyncError

    handleSyncError(new MatrixError('M_UNKNOWN_TOKEN', 'expired'), { backoff: 1_000 })
    await vi.waitFor(() => expect(api.registerGuest).toHaveBeenCalledOnce())

    await controller.sendMessage('hi')

    expect(api.registerGuest).toHaveBeenCalledOnce()
    expect(applied.filter((action) => action.type === 'session.recovering')).toHaveLength(1)
    recoverySync.resolve(syncResponse('s1'))
    await vi.waitFor(() => expect(api.initialSync).toHaveBeenCalledOnce())
    controller.disconnect()
  })

  it('sendMessage clears tokens and reports connection failure on user deactivation', async () => {
    const api = makeMatrixApi({
      sendMessage: vi
        .fn<MatrixApi['sendMessage']>()
        .mockRejectedValue(new MatrixError('M_USER_DEACTIVATED', 'disabled')),
    })
    const { controller, applied, tokens } = harness({ phase: 'connected', identity: IDENTITY }, api)
    tokens.setSession({ accessToken: 'token', refreshToken: 'refresh', userId: '@u:bank' })

    await controller.sendMessage('hi')

    expect(applied).toContainEqual({ type: 'message.failed', localId: expect.any(String) })
    expect(applied).toContainEqual({
      type: 'connection.failed',
      error: CONNECTION_FAILED_ERROR,
    })
    expect(api.registerGuest).not.toHaveBeenCalled()
    expect(tokens.getAccessToken()).toBeNull()
    expect(tokens.getRefreshToken()).toBeNull()
  })

  it('ignores a send result after the controller lifecycle changes', async () => {
    const send = deferred<Awaited<ReturnType<MatrixApi['sendMessage']>>>()
    const api = makeMatrixApi({
      sendMessage: vi.fn<MatrixApi['sendMessage']>().mockReturnValue(send.promise),
    })
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    const promise = controller.sendMessage('hi')
    await vi.waitFor(() => expect(api.sendMessage).toHaveBeenCalledOnce())

    controller.disconnect()
    send.resolve({ event_id: '$late' })
    await promise

    expect(applied.filter((action) => action.type === 'message.optimisticAdded')).toHaveLength(1)
    expect(applied.some((action) => action.type === 'message.sent')).toBe(false)
  })

  it('resendMessage dispatches retrying then sent under the same localId', async () => {
    const { controller, applied } = harness({
      phase: 'connected',
      identity: IDENTITY,
      room: roomWithMessage(failedMessage({ txnId: 'txn-original' })),
    })

    await controller.resendMessage('local-1')

    expect(applied[0]).toEqual({ type: 'message.retrying', localId: 'local-1' })
    expect(applied[1]).toEqual({ type: 'message.sent', localId: 'local-1', eventId: '$real' })
  })

  it('resendMessage reuses the original txnId so the server can dedup the retry', async () => {
    const api = makeMatrixApi()
    const { controller } = harness(
      {
        phase: 'connected',
        identity: IDENTITY,
        room: roomWithMessage(failedMessage({ txnId: 'txn-original' })),
      },
      api,
    )

    await controller.resendMessage('local-1')

    const [, txnId] = vi.mocked(api.sendMessage).mock.calls[0]!
    expect(txnId).toBe('txn-original')
  })

  it('resendMessage does nothing when the failed message has no txnId', async () => {
    const { controller, dispatch } = harness({
      phase: 'connected',
      identity: IDENTITY,
      room: roomWithMessage(failedMessage()),
    })

    await controller.resendMessage('local-1')

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('resendMessage dispatches message.failed on a repeat send failure', async () => {
    const api = makeMatrixApi({
      sendMessage: vi.fn<MatrixApi['sendMessage']>().mockRejectedValue(new Error('network down')),
    })
    const { controller, applied } = harness(
      {
        phase: 'connected',
        identity: IDENTITY,
        room: roomWithMessage(failedMessage({ txnId: 'txn-original' })),
      },
      api,
    )

    await controller.resendMessage('local-1')

    expect(applied).toContainEqual({ type: 'message.failed', localId: 'local-1' })
  })

  it('resendMessage does nothing when the message is not failed', async () => {
    const { controller, dispatch } = harness({
      phase: 'connected',
      identity: IDENTITY,
      room: roomWithMessage(
        textItem({
          localId: 'local-1',
          eventId: 'optimistic:local-1',
          sender: IDENTITY.userId,
          body: 'hi',
          ts: 1,
        }),
      ),
    })

    await controller.resendMessage('local-1')

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not start auth recovery from a stale send error', async () => {
    const send = deferred<Awaited<ReturnType<MatrixApi['sendMessage']>>>()
    const api = makeMatrixApi({
      sendMessage: vi.fn<MatrixApi['sendMessage']>().mockReturnValue(send.promise),
    })
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    const promise = controller.sendMessage('hi')
    await vi.waitFor(() => expect(api.sendMessage).toHaveBeenCalledOnce())

    controller.disconnect()
    send.reject(new MatrixError('M_UNKNOWN_TOKEN', 'expired'))
    await promise

    expect(applied.filter((action) => action.type === 'message.optimisticAdded')).toHaveLength(1)
    expect(applied.some((action) => action.type === 'message.failed')).toBe(false)
    expect(api.registerGuest).not.toHaveBeenCalled()
  })
})
