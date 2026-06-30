import { describe, expect, it, vi } from 'vitest'
import type { ChatRuntimeState, RuntimeAction } from '../../store/model'
import { INITIAL_RUNTIME_STATE } from '../../store/store'
import type { JoinedRoom } from '../../types/matrix'
import type { MatrixApi } from '../matrixApi'
import { MatrixController } from '../matrixController'

vi.mock('../httpClient', () => ({ setAccessToken: vi.fn() }))

function emptyJoined(): JoinedRoom {
  return { state: { events: [] }, timeline: { events: [] } }
}

function makeApi(over: Partial<MatrixApi> = {}): MatrixApi {
  return {
    registerGuest: vi
      .fn<MatrixApi['registerGuest']>()
      .mockResolvedValue({ user_id: '@u:bank', device_id: 'd1', access_token: 'tok' }),
    initialSync: vi
      .fn<MatrixApi['initialSync']>()
      .mockResolvedValue({ next_batch: 's0', rooms: { join: { '!r:bank': emptyJoined() } } }),
    // long-poll parks → no tick, deterministic
    longPollSync: vi.fn<MatrixApi['longPollSync']>().mockReturnValue(new Promise<never>(() => {})),
    sendMessage: vi.fn<MatrixApi['sendMessage']>().mockResolvedValue({ event_id: '$real' }),
    ...over,
  }
}

// Контролируемый снимок стора + спай на apply — проверяем, какие доменные
// действия контроллер диспетчит (стор реальный не подключаем).
function harness(initial: Partial<ChatRuntimeState> = {}, api: MatrixApi = makeApi()) {
  const state: ChatRuntimeState = { ...INITIAL_RUNTIME_STATE, ...initial }
  const applied: RuntimeAction[] = []
  const dispatch = vi.fn((action: RuntimeAction) => {
    applied.push(action)
  })
  const controller = new MatrixController({ dispatch, getState: () => state, api })
  return { controller, dispatch, applied }
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
      makeApi({
        registerGuest: vi.fn<MatrixApi['registerGuest']>().mockRejectedValue(new Error('net')),
      }),
    )

    await controller.connect()

    expect(applied.at(-1)).toEqual({ type: 'connection.failed', error: 'Не удалось подключиться' })
  })

  it('does not connect when already connected', async () => {
    const api = makeApi()
    const { controller } = harness({ phase: 'connected' }, api)

    await controller.connect()

    expect(api.registerGuest).not.toHaveBeenCalled()
  })

  it('sendMessage dispatches optimisticAdded then sent', async () => {
    const { controller, applied } = harness({ identity: { userId: '@u:bank', roomId: '!r:bank' } })

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
})
