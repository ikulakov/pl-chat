import { describe, expect, it, vi } from 'vitest'
import { isSystem, type TextTimelineItem } from '../domain/timeline'
import {
  createFakeTokenStore,
  deferred,
  makeMatrixApi,
  messagesResponse,
  roomMessageEvent,
  syncResponse,
  textItem,
} from '../shared/testUtils/matrixFixtures'
import { chatRuntimeReducer } from '../store/reducer'
import type { ChatRuntimeState, Identity, RoomState, RuntimeAction } from '../store/state'
import { INITIAL_RUNTIME_STATE } from '../store/store'
import type { MatrixApi } from './matrixApi'
import { CONNECTION_FAILED_ERROR, MatrixController } from './matrixController'
import { MatrixSessionManager } from './session/sessionManager'
import { MatrixError } from './transport/matrixError'

vi.mock('../shared/utils/sleep', () => ({ sleep: () => Promise.resolve() }))

// jsdom не грузит <img> → readImageDimensions зависла бы. Мокаем интринсик-размеры.
vi.mock('../shared/utils/imageDimensions', () => ({
  readImageDimensions: vi.fn().mockResolvedValue({ w: 100, h: 50 }),
}))

const IDENTITY: Identity = { userId: '@u:bank', roomId: '!r:bank' }

function makeFile(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

// Стор с реальным редьюсером + спай на apply: проверяем, какие доменные действия контроллер
// диспетчит, а состояние эволюционирует по-настоящему — контроллер читает из getState()
// собственные записи (например, read-маркер в markRead), фальшивый статичный снимок это скрыл бы.
function harness(initial: Partial<ChatRuntimeState> = {}, api: MatrixApi = makeMatrixApi()) {
  const tokens = createFakeTokenStore()
  let state: ChatRuntimeState = { ...INITIAL_RUNTIME_STATE, ...initial }
  const applied: RuntimeAction[] = []
  const dispatch = vi.fn((action: RuntimeAction) => {
    applied.push(action)
    state = chatRuntimeReducer(state, action)
  })
  const sessionManager = new MatrixSessionManager(api, tokens)
  const controller = new MatrixController({ dispatch, getState: () => state, api, sessionManager })
  // setState — рубильник для сценариев, которых нет в action-модели (например, teardown стора
  // при destroy виджета): подменяет состояние напрямую, мимо applied.
  const setState = (partial: Partial<ChatRuntimeState>) => {
    state = { ...state, ...partial }
  }
  return { controller, dispatch, applied, tokens, getState: () => state, setState }
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
    ...INITIAL_RUNTIME_STATE.room,
    timeline: [message],
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
    const { controller, applied, setState } = harness({}, api)

    await controller.connect()
    await vi.waitFor(() => expect(api.initialSync).toHaveBeenCalledTimes(2))

    controller.disconnect()
    // disconnect — lifecycle-рубильник, стор он не трогает (фаза осталась 'recovering');
    // в реальном приложении destroy пересоздаёт стор — имитируем свежий старт
    setState({ phase: 'idle' })
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

  it('sendMessage dispatches optimisticAdded then optimisticResolved', async () => {
    const { controller, applied } = harness({
      phase: 'connected',
      identity: IDENTITY,
    })

    await controller.sendMessage('hi')

    expect(applied[0]!.type).toBe('message.optimisticAdded')
    expect(applied.at(-1)).toEqual({
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

  it('sendFile puts the draft into the timeline before the upload finishes', async () => {
    const upload = deferred<Awaited<ReturnType<MatrixApi['uploadMedia']>>>()
    const api = makeMatrixApi({
      uploadMedia: vi.fn<MatrixApi['uploadMedia']>().mockReturnValue(upload.promise),
    })
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    const sending = controller.sendFile(makeFile('doc.pdf', 'application/pdf'))
    await vi.waitFor(() =>
      expect(applied.some((a) => a.type === 'message.optimisticAdded')).toBe(true),
    )

    // черновик виден сразу, mxc ещё нет — его место занимает локальный upload-стейт
    expect(applied.find((a) => a.type === 'message.optimisticAdded')).toMatchObject({
      message: { kind: 'file', content: { url: '', filename: 'doc.pdf' }, upload: { pct: 0 } },
    })
    expect(api.sendMediaMessage).not.toHaveBeenCalled()

    upload.resolve({ content_uri: 'mxc://bank.ru/abc' })
    await sending

    await vi.waitFor(() => expect(applied.some((a) => a.type === 'message.sent')).toBe(true))
    expect(api.sendMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: IDENTITY.roomId,
        kind: 'file',
        content: expect.objectContaining({ url: 'mxc://bank.ru/abc' }),
      }),
    )
  })

  it('sendFile с replyToEventId доносит связь до отправки и очищает reply', async () => {
    const api = makeMatrixApi()
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendFile(makeFile('doc.pdf', 'application/pdf'), {
      replyToEventId: '$parent:bank',
    })

    expect(api.sendMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({ replyToEventId: '$parent:bank' }),
    )
    expect(applied).toContainEqual({ type: 'reply.cleared' })
  })

  it('sendFile puts intrinsic w/h into image info', async () => {
    const api = makeMatrixApi()
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendFile(makeFile('p.png', 'image/png'))

    expect(api.sendMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'image',
        content: expect.objectContaining({ info: expect.objectContaining({ w: 100, h: 50 }) }),
      }),
    )
  })

  it('sendFile отправляет один и тот же MIME в Content-Type и в info.mimetype', async () => {
    const api = makeMatrixApi()
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    // браузер часто отдаёт для .docx пустой type — заявленный тип должен браться из расширения,
    // иначе сервер отвергнет приём (заголовок сверяется с содержимым)
    await controller.sendFile(makeFile('выписка.docx', ''))

    const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    expect(api.uploadMedia).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ contentType: docxMime }),
    )
    expect(api.sendMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ info: expect.objectContaining({ mimetype: docxMime }) }),
      }),
    )
  })

  it('sendFile marks the draft failed when the upload itself fails', async () => {
    const api = makeMatrixApi({
      // причину отказа не разбираем: серверная формулировка (только русская) в ленту
      // не попадает, текст один на все коды
      uploadMedia: vi
        .fn<MatrixApi['uploadMedia']>()
        .mockRejectedValue(new MatrixError('M_INVALID_PARAM', 'server-side wording')),
    })
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendFile(makeFile('big.pdf', 'application/pdf'))

    // ошибка загрузки видна на сообщении, а не в композере — сообщение уже в ленте;
    // текст рисует MediaContent по уцелевшему upload, в действии причины нет
    expect(applied.some((a) => a.type === 'message.optimisticAdded')).toBe(true)
    expect(applied).toContainEqual({ type: 'message.failed', localId: expect.any(String) })
    expect(api.sendMediaMessage).not.toHaveBeenCalled()
  })

  it('sendFile marks the draft failed when the send fails', async () => {
    const api = makeMatrixApi({
      sendMediaMessage: vi
        .fn<MatrixApi['sendMediaMessage']>()
        .mockRejectedValue(new MatrixError('M_UNKNOWN', 'boom')),
    })
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendFile(makeFile('doc.pdf', 'application/pdf'))

    await vi.waitFor(() =>
      expect(applied).toContainEqual({ type: 'message.failed', localId: expect.any(String) }),
    )
  })

  it('cancelUpload aborts the upload and drops the draft from the timeline', async () => {
    const upload = deferred<Awaited<ReturnType<MatrixApi['uploadMedia']>>>()
    let signal: AbortSignal | undefined
    const api = makeMatrixApi({
      uploadMedia: vi.fn<MatrixApi['uploadMedia']>().mockImplementation((_file, options) => {
        signal = options?.signal
        return upload.promise
      }),
    })
    const { controller, applied, getState } = harness(
      { phase: 'connected', identity: IDENTITY },
      api,
    )

    const sending = controller.sendFile(makeFile('doc.pdf', 'application/pdf'))
    await vi.waitFor(() => expect(signal).toBeDefined())
    const draft = getState().room.timeline.find((m) => !isSystem(m))!

    controller.cancelUpload(draft.localId)

    expect(signal!.aborted).toBe(true)
    expect(getState().room.timeline).toHaveLength(0)

    // отменённая загрузка не должна оставить после себя ни failed, ни PUT /send
    upload.reject(new DOMException('Upload aborted', 'AbortError'))
    await sending
    expect(applied.some((a) => a.type === 'message.failed')).toBe(false)
    expect(api.sendMediaMessage).not.toHaveBeenCalled()
  })

  it('recovery по auth-ошибке обрывает загрузку в полёте — PUT в старую комнату не уходит', async () => {
    // Ошибка прилетела из отправки текста, а не из загрузки. Recovery НЕ бампает lifecycle
    // (см. тест про догрузку истории ниже), поэтому единственное, что снимает загрузку, —
    // явный abort в recoverFromAuthError. Без него файл догрузится уже после пересоздания
    // сессии и уедет PUT'ом в комнату, которой у нового гостя нет.
    const upload = deferred<Awaited<ReturnType<MatrixApi['uploadMedia']>>>()
    let signal: AbortSignal | undefined
    const api = makeMatrixApi({
      uploadMedia: vi.fn<MatrixApi['uploadMedia']>().mockImplementation((_file, options) => {
        signal = options?.signal
        return upload.promise
      }),
      sendMessage: vi
        .fn<MatrixApi['sendMessage']>()
        .mockRejectedValue(new MatrixError('M_UNKNOWN_TOKEN', 'expired')),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    const sending = controller.sendFile(makeFile('doc.pdf', 'application/pdf'))
    await vi.waitFor(() => expect(signal).toBeDefined())

    await controller.sendMessage('hi')

    expect(signal!.aborted).toBe(true)

    // даже если байты всё-таки дошли, отправлять уже нечего и некуда
    upload.resolve({ content_uri: 'mxc://bank.ru/abc' })
    await sending

    expect(api.sendMediaMessage).not.toHaveBeenCalled()
    controller.disconnect()
  })

  it('деактивация аккаунта обрывает загрузку в полёте — байты не льются в мёртвую сессию', async () => {
    const upload = deferred<Awaited<ReturnType<MatrixApi['uploadMedia']>>>()
    let signal: AbortSignal | undefined
    const api = makeMatrixApi({
      uploadMedia: vi.fn<MatrixApi['uploadMedia']>().mockImplementation((_file, options) => {
        signal = options?.signal
        return upload.promise
      }),
      sendMessage: vi
        .fn<MatrixApi['sendMessage']>()
        .mockRejectedValue(new MatrixError('M_USER_DEACTIVATED', 'disabled')),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    const sending = controller.sendFile(makeFile('doc.pdf', 'application/pdf'))
    await vi.waitFor(() => expect(signal).toBeDefined())

    await controller.sendMessage('hi')

    // смена lifecycle отбросила бы результат, но XHR продолжал бы качать файл целиком
    expect(signal!.aborted).toBe(true)

    upload.resolve({ content_uri: 'mxc://bank.ru/abc' })
    await sending

    expect(api.sendMediaMessage).not.toHaveBeenCalled()
  })

  it('resendMessage re-uploads the file when the draft never got an mxc', async () => {
    const api = makeMatrixApi({
      uploadMedia: vi
        .fn<MatrixApi['uploadMedia']>()
        .mockRejectedValueOnce(new MatrixError('M_UNKNOWN', 'boom'))
        .mockResolvedValueOnce({ content_uri: 'mxc://bank.ru/retry' }),
    })
    const { controller, applied, getState } = harness(
      { phase: 'connected', identity: IDENTITY },
      api,
    )

    await controller.sendFile(makeFile('doc.pdf', 'application/pdf'))
    const draft = getState().room.timeline.find((m) => !isSystem(m))!

    await controller.resendMessage(draft.localId)

    // повтор начинается с байт: PUT /send без mxc отправлять нечего
    expect(api.uploadMedia).toHaveBeenCalledTimes(2)
    expect(api.sendMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ url: 'mxc://bank.ru/retry' }),
      }),
    )
    await vi.waitFor(() => expect(applied.some((a) => a.type === 'message.sent')).toBe(true))
  })

  it('sendMessage triggers session recovery when the send itself hits an auth error', async () => {
    const api = makeMatrixApi({
      sendMessage: vi
        .fn<MatrixApi['sendMessage']>()
        .mockRejectedValue(new MatrixError('M_UNKNOWN_TOKEN', 'expired')),
    })
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendMessage('hi')

    await vi.waitFor(() =>
      expect(applied).toContainEqual({ type: 'message.failed', localId: expect.any(String) }),
    )
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

    await vi.waitFor(() =>
      expect(applied).toContainEqual({ type: 'message.failed', localId: expect.any(String) }),
    )
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

  it('resendMessage dispatches retrying then optimisticResolved under the same localId', async () => {
    const { controller, applied } = harness({
      phase: 'connected',
      identity: IDENTITY,
      room: roomWithMessage(failedMessage({ txnId: 'txn-original' })),
    })

    await controller.resendMessage('local-1')

    expect(applied[0]).toEqual({ type: 'message.retrying', localId: 'local-1' })
    expect(applied[1]).toEqual({
      type: 'message.sent',
      localId: 'local-1',
      eventId: '$real',
    })
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

    const [{ txnId }] = vi.mocked(api.sendMessage).mock.calls[0]!
    expect(txnId).toBe('txn-original')
  })

  it('resendMessage упавшего ответа сохраняет связь с родителем', async () => {
    // связь легко потерять при ретрае: контроллер собирает запрос заново и должен
    // перечитать relation из самого сообщения, а не из (уже сброшенной) цели ответа
    const api = makeMatrixApi()
    const { controller } = harness(
      {
        phase: 'connected',
        identity: IDENTITY,
        room: roomWithMessage(
          failedMessage({ txnId: 'txn-original', relation: { type: 'reply', eventId: '$parent' } }),
        ),
      },
      api,
    )

    await controller.resendMessage('local-1')

    const [{ replyToEventId }] = vi.mocked(api.sendMessage).mock.calls[0]!
    expect(replyToEventId).toBe('$parent')
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

  it('markRead moves the store marker optimistically and posts the receipt', async () => {
    const api = makeMatrixApi()
    const { controller, getState } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.markRead('$op1')

    expect(api.sendReadReceipt).toHaveBeenCalledExactlyOnceWith(IDENTITY.roomId, '$op1')
    // маркер в сторе — единственный источник «докуда отчитались»
    expect(getState().room.readReceipts[IDENTITY.userId]).toEqual({ eventId: '$op1' })
  })

  it('markRead deduplicates repeat calls for the same eventId (throttle on re-sync)', async () => {
    const api = makeMatrixApi()
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.markRead('$op1')
    await controller.markRead('$op1')

    expect(api.sendReadReceipt).toHaveBeenCalledOnce()
  })

  it('markRead skips the POST when the marker was rehydrated from the sync echo (после F5)', async () => {
    // initial sync вернул наш же receipt эхом → маркер уже в сторе → пере-POST не нужен
    const api = makeMatrixApi()
    const { controller } = harness(
      {
        phase: 'connected',
        identity: IDENTITY,
        room: {
          ...INITIAL_RUNTIME_STATE.room,
          readReceipts: { [IDENTITY.userId]: { eventId: '$op1' } },
        },
      },
      api,
    )

    await controller.markRead('$op1')

    expect(api.sendReadReceipt).not.toHaveBeenCalled()
  })

  it('markRead does nothing when not connected', async () => {
    const api = makeMatrixApi()
    const { controller } = harness({ phase: 'connecting', identity: IDENTITY }, api)

    await controller.markRead('$op1')

    expect(api.sendReadReceipt).not.toHaveBeenCalled()
  })

  it('markRead keeps the optimistic marker on a non-auth failure and does not re-POST', async () => {
    // M_NOT_FOUND: writer ещё не персистнул событие. Откат заставил бы каждый следующий скан
    // повторно слать тот же receipt (цикл move→POST→rollback). Маркер остаётся сдвинутым.
    const api = makeMatrixApi({
      sendReadReceipt: vi
        .fn<MatrixApi['sendReadReceipt']>()
        .mockRejectedValue(new MatrixError('M_NOT_FOUND', 'not persisted yet')),
    })
    const { controller, getState } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.markRead('$op1')
    expect(getState().room.readReceipts[IDENTITY.userId]).toEqual({ eventId: '$op1' })

    // повторный скан того же события не шлёт новый POST — гард видит маркер на месте
    await controller.markRead('$op1')
    expect(api.sendReadReceipt).toHaveBeenCalledOnce()
  })

  it('markRead rolls the marker back after a failure and escalates auth errors', async () => {
    const api = makeMatrixApi({
      sendReadReceipt: vi
        .fn<MatrixApi['sendReadReceipt']>()
        .mockRejectedValueOnce(new MatrixError('M_UNKNOWN_TOKEN', 'expired'))
        .mockResolvedValueOnce({}),
    })
    const { controller, applied, getState } = harness(
      { phase: 'connected', identity: IDENTITY },
      api,
    )

    await controller.markRead('$op1')
    // маркер откатился — ближайший скан повторит POST
    expect(getState().room.readReceipts[IDENTITY.userId]).toBeUndefined()
    // auth-ошибка эскалирует восстановление сессии; ждём её завершения (phase снова connected)
    await vi.waitFor(() => expect(applied).toContainEqual({ type: 'session.recovering' }))
    await vi.waitFor(() => expect(getState().phase).toBe('connected'))

    await controller.markRead('$op1')

    expect(api.sendReadReceipt).toHaveBeenCalledTimes(2)
    controller.disconnect()
  })
})

describe('MatrixController — подгрузка истории вверх', () => {
  function connected(prevBatch: string | null, api: MatrixApi) {
    return harness(
      {
        phase: 'connected',
        identity: IDENTITY,
        room: { ...INITIAL_RUNTIME_STATE.room, prevBatch },
      },
      api,
    )
  }

  it('disconnect обрывает догрузку в полёте — страница уже не префиксит ленту', async () => {
    // виджет закрыли посреди загрузки: запрос абортится, флаг снимается, а резолв прерванной
    // страницы (пришедший позже) в ленту попасть не должен
    const page = deferred<Awaited<ReturnType<MatrixApi['getRoomHistory']>>>()
    const api = makeMatrixApi({
      getRoomHistory: vi.fn<MatrixApi['getRoomHistory']>().mockReturnValue(page.promise),
    })
    const { controller, getState } = connected('p1', api)

    const inFlight = controller.loadMoreHistory()
    controller.disconnect()

    const signal = vi.mocked(api.getRoomHistory).mock.calls[0]![2]
    expect(signal!.aborted).toBe(true)
    expect(getState().room.isLoadingHistory).toBe(false)

    page.resolve(messagesResponse([roomMessageEvent({ event_id: '$old' })], 'p2'))
    await inFlight

    expect(getState().room.timeline).toHaveLength(0)
    expect(getState().room.prevBatch).toBe('p1')
  })

  it('recovery по auth-ошибке из другого вызова обрывает догрузку истории', async () => {
    // Ошибка прилетела из отправки, а не из истории. Recovery НЕ бампает lifecycle,
    // поэтому isStale остаётся false — единственное, что снимает догрузку, это
    // stopLoadingHistory в recoverFromAuthError. Без него страница старой комнаты
    // догрузится уже после пересоздания сессии.
    const page = deferred<Awaited<ReturnType<MatrixApi['getRoomHistory']>>>()
    const api = makeMatrixApi({
      getRoomHistory: vi.fn<MatrixApi['getRoomHistory']>().mockReturnValue(page.promise),
      sendMessage: vi
        .fn<MatrixApi['sendMessage']>()
        .mockRejectedValue(new MatrixError('M_UNKNOWN_TOKEN', 'expired')),
    })
    const { controller, getState } = connected('p1', api)

    const inFlight = controller.loadMoreHistory()
    await controller.sendMessage('hi')

    const signal = vi.mocked(api.getRoomHistory).mock.calls[0]![2]
    expect(signal!.aborted).toBe(true)

    page.resolve(messagesResponse([roomMessageEvent({ event_id: '$old' })], 'p2'))
    await inFlight

    expect(getState().room.timeline.map((item) => item.eventId)).not.toContain('$old')
    controller.disconnect()
  })

  it('смена lifecycle во время retry не пишет в новый стор', async () => {
    // между попытками сессия пересоздалась (disconnect) — устаревший retry должен молчать
    const page = deferred<Awaited<ReturnType<MatrixApi['getRoomHistory']>>>()
    const api = makeMatrixApi({
      getRoomHistory: vi
        .fn<MatrixApi['getRoomHistory']>()
        .mockRejectedValueOnce(new MatrixError('M_UNKNOWN', 'boom'))
        .mockReturnValueOnce(page.promise),
    })
    const { controller, getState } = connected('p1', api)

    const inFlight = controller.loadMoreHistory()
    // рвём lifecycle до того, как retry успеет записать settled
    controller.disconnect()
    page.resolve(messagesResponse([roomMessageEvent({ event_id: '$old' })], 'p2'))
    await inFlight

    // устаревший цикл не тронул стор
    expect(getState().room.timeline).toEqual([])
  })
})
