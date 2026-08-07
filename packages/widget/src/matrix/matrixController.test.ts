import { describe, expect, it, vi } from 'vitest'
import { isSystem, type TextTimelineItem } from '../domain/timeline'
import {
  createFakeTokenStore,
  deferred,
  makeFile,
  makeMatrixApi,
  messagesResponse,
  roomMessageEvent,
  syncResponse,
  textItem,
} from '../shared/testUtils/matrixFixtures'
import { chatRuntimeReducer } from '../store/reducer'
import type { ChatRuntimeState, Identity, RoomState, RuntimeAction } from '../store/state'
import { INITIAL_RUNTIME_STATE } from '../store/store'
import type { MatrixApi } from './api/matrixApi'
import { MatrixError } from './api/matrixError'
import { CONNECTION_FAILED_ERROR, MatrixController } from './matrixController'
import { MatrixSessionManager } from './session/sessionManager'

vi.mock('../shared/utils/sleep', () => ({ sleep: () => Promise.resolve() }))

const IDENTITY: Identity = { userId: '@u:bank', roomId: '!r:bank' }

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

  return { controller, dispatch, applied, tokens, getState: () => state }
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

  it('disconnect сбрасывает рантайм, поэтому повторный connect поднимает сессию заново', async () => {
    // До сброса стора disconnect оставлял phase 'connected', и гард в connect() навсегда
    // запирал переподключение — виджет уже не поднимался.
    const { controller, getState } = harness()

    await controller.connect()
    controller.disconnect()

    expect(getState()).toEqual(INITIAL_RUNTIME_STATE)

    await controller.connect()

    expect(getState().phase).toBe('connected')
    expect(getState().identity).not.toBeNull()
    controller.disconnect()
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

    const sending = controller.sendFile(makeFile('doc.pdf', 1, 'application/pdf'))
    await vi.waitFor(() =>
      expect(applied.some((a) => a.type === 'message.optimisticAdded')).toBe(true),
    )

    // черновик виден сразу, mxc ещё нет — его место занимает локальный upload-стейт
    expect(applied.find((a) => a.type === 'message.optimisticAdded')).toMatchObject({
      message: { kind: 'file', content: { url: '', filename: 'doc.pdf' }, upload: { pct: 0 } },
    })
    expect(api.sendMessage).not.toHaveBeenCalled()

    upload.resolve({ content_uri: 'mxc://bank.ru/abc' })
    await sending

    await vi.waitFor(() => expect(applied.some((a) => a.type === 'message.sent')).toBe(true))
    expect(api.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: IDENTITY.roomId,
        content: expect.objectContaining({ msgtype: 'm.file', url: 'mxc://bank.ru/abc' }),
      }),
    )
  })

  it('sendFile с replyToEventId доносит связь до отправки и очищает reply', async () => {
    const api = makeMatrixApi()
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendFile(makeFile('doc.pdf', 1, 'application/pdf'), {
      replyToEventId: '$parent:bank',
    })

    expect(api.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          'm.relates_to': { 'm.in_reply_to': { event_id: '$parent:bank' } },
        }),
      }),
    )
    expect(applied).toContainEqual({ type: 'reply.cleared' })
  })

  it('размеры, прочитанные при выборе файла, доезжают до черновика и до события', async () => {
    // черновик знает пропорции сразу — место под превью в ленте не прыгает после загрузки
    const api = makeMatrixApi()
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendFile(makeFile('p.png', 1, 'image/png'), { dims: { w: 800, h: 600 } })

    expect(applied.find((a) => a.type === 'message.optimisticAdded')).toMatchObject({
      message: { content: { info: { w: 800, h: 600 } } },
    })
    expect(api.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ info: expect.objectContaining({ w: 800, h: 600 }) }),
      }),
    )
  })

  it('sendFile отправляет один и тот же MIME в Content-Type и в info.mimetype', async () => {
    const api = makeMatrixApi()
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    // браузер часто отдаёт для .docx пустой type — заявленный тип должен браться из расширения,
    // иначе сервер отвергнет приём (заголовок сверяется с содержимым)
    await controller.sendFile(makeFile('выписка.docx', 1, ''))

    const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    expect(api.uploadMedia).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ contentType: docxMime }),
    )
    expect(api.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ info: expect.objectContaining({ mimetype: docxMime }) }),
      }),
    )
  })

  it('sendFile marks the draft failed when the upload itself fails', async () => {
    const api = makeMatrixApi({
      // серверная формулировка (только русская) в ленту не попадает — наружу уходит
      // классификация, по которой UI решает, предлагать повтор или удаление
      uploadMedia: vi
        .fn<MatrixApi['uploadMedia']>()
        .mockRejectedValue(new MatrixError('M_INVALID_PARAM', 'server-side wording')),
    })
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendFile(makeFile('big.pdf', 1, 'application/pdf'))

    // ошибка загрузки видна на сообщении, а не в композере — сообщение уже в ленте
    expect(applied.some((a) => a.type === 'message.optimisticAdded')).toBe(true)
    expect(applied).toContainEqual({
      type: 'message.failed',
      localId: expect.any(String),
      // fileguard отказал детерминированно — повтор дал бы тот же ответ
      upload: 'rejected',
    })
    expect(api.sendMessage).not.toHaveBeenCalled()
  })

  it('sendFile marks the draft failed when the send fails', async () => {
    const api = makeMatrixApi({
      sendMessage: vi
        .fn<MatrixApi['sendMessage']>()
        .mockRejectedValue(new MatrixError('M_UNKNOWN', 'boom')),
    })
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendFile(makeFile('doc.pdf', 1, 'application/pdf'))

    await vi.waitFor(() =>
      expect(applied).toContainEqual({ type: 'message.failed', localId: expect.any(String) }),
    )
  })

  it('превью одной картинки качается один раз на все ряды, оригинал — каждый раз заново', async () => {
    const thumb = deferred<Blob>()
    const api = makeMatrixApi({
      getThumbnail: vi.fn<MatrixApi['getThumbnail']>().mockReturnValue(thumb.promise),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)
    const mxcUrl = 'mxc://bank.ru/abc'
    const size = { width: 320, height: 240 }

    // два ряда просят одно превью, пока первый запрос ещё в полёте
    const inFlight = Promise.all([
      controller.loadPreview(mxcUrl, size),
      controller.loadPreview(mxcUrl, size),
    ])
    thumb.resolve(new Blob(['thumb']))
    const [first, second] = await inFlight
    const afterCache = await controller.loadPreview(mxcUrl, size)

    expect(api.getThumbnail).toHaveBeenCalledOnce()
    expect(second).toBe(first)
    expect(afterCache).toBe(first)

    // оригинал в кэш не кладём: многомегабайтному blob'у незачем висеть до конца сессии
    await controller.downloadFile('mxc://bank.ru/abc')
    await controller.downloadFile('mxc://bank.ru/abc')
    expect(api.downloadMedia).toHaveBeenCalledTimes(2)
  })

  it('упавший запрос превью не залипает в кэше — повтор идёт в сеть заново', async () => {
    const blob = new Blob(['thumb'])
    const api = makeMatrixApi({
      getThumbnail: vi
        .fn<MatrixApi['getThumbnail']>()
        .mockRejectedValueOnce(new MatrixError('M_UNKNOWN', 'timeout', undefined, 500))
        .mockResolvedValue(blob),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)
    const mxcUrl = 'mxc://bank.ru/abc'
    const size = { width: 320, height: 240 }

    await expect(controller.loadPreview(mxcUrl, size)).rejects.toMatchObject({ reason: 'failed' })

    // без выброса записи повтор вернул бы тот же отклонённый (а при зависании — вечный) промис
    await expect(controller.loadPreview(mxcUrl, size)).resolves.toBe(blob)
    expect(api.getThumbnail).toHaveBeenCalledTimes(2)
  })

  // Локальная копия своего файла — не приоритет, а подмена на время карантина CDR: сервер
  // чистит файл (пересжатие, вычистка PDF), поэтому его версия важнее нашей везде, кроме 504.
  it('пока свой файл в карантине (504) показываем локальную копию', async () => {
    const api = makeMatrixApi({
      getThumbnail: vi
        .fn<MatrixApi['getThumbnail']>()
        .mockRejectedValue(new MatrixError('M_NOT_YET_UPLOADED', 'quarantine', undefined, 504)),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)
    const file = makeFile('photo.png', 1, 'image/png')
    const mxcUrl = 'mxc://bank.ru/abc'
    const size = { width: 320, height: 240 }

    await controller.sendFile(file)

    // сначала спрашиваем сервер и только на «ещё не готово» подставляем свои байты
    await expect(controller.loadPreview(mxcUrl, size)).resolves.toBe(file)
    expect(api.getThumbnail).toHaveBeenCalledOnce()

    // подмена живёт снаружи кэша: осядь локальный blob под ключом превью — за очищенной
    // сервером версией мы не сходили бы уже никогда
    await expect(controller.loadPreview(mxcUrl, size)).resolves.toBe(file)
    expect(api.getThumbnail).toHaveBeenCalledTimes(2)
  })

  // Право на файл появляется вместе с записью привязки к комнате, и свой же файл может
  // получить 403 сразу после отправки. Отложенный повтор внутри — не гарантия: показать
  // отправителю ошибку по файлу, который лежит у нас в памяти, хуже, чем показать сам файл.
  it('403, переживший повтор, тоже подменяется локальной копией', async () => {
    const api = makeMatrixApi({
      downloadMedia: vi
        .fn<MatrixApi['downloadMedia']>()
        .mockRejectedValue(new MatrixError('M_FORBIDDEN', 'no access', undefined, 403)),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)
    const file = makeFile('doc.pdf', 1, 'application/pdf')

    await controller.sendFile(file)

    await expect(controller.downloadFile('mxc://bank.ru/abc')).resolves.toBe(file)
  })

  // Своя копия живёт до первого ответа сервера, а у файла сервер спрашивают только по клику
  // «скачать» — без потолка всё отправленное за сеанс осталось бы в памяти до конца сессии.
  it('держит только последние свои файлы, давние копии вытесняет', async () => {
    let uploaded = 0
    const api = makeMatrixApi({
      downloadMedia: vi
        .fn<MatrixApi['downloadMedia']>()
        .mockRejectedValue(new MatrixError('M_NOT_YET_UPLOADED', 'quarantine', undefined, 504)),
      uploadMedia: vi.fn<MatrixApi['uploadMedia']>().mockImplementation(() => {
        uploaded += 1
        return Promise.resolve({ content_uri: `mxc://bank.ru/file${uploaded}` })
      }),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    // потолок — 5 файлов, шестая отправка выбрасывает самую давнюю копию
    let last = makeFile('f0.pdf', 1, 'application/pdf')
    for (let i = 1; i <= 6; i += 1) {
      last = makeFile(`f${i}.pdf`, 1, 'application/pdf')
      await controller.sendFile(last)
    }

    // последний отправленный на месте, самый давний вытеснен — ошибка карантина дошла до UI
    await expect(controller.downloadFile('mxc://bank.ru/file6')).resolves.toBe(last)
    await expect(controller.downloadFile('mxc://bank.ru/file1')).rejects.toMatchObject({
      reason: 'pending',
    })
  })

  // Оригинал на порядки тяжелее миниатюры: одна такая запись обесценила бы лимит,
  // посчитанный в записях, поэтому подмена превью оригиналом мимо кэша.
  it('оригинал, отданный вместо несгенерированного превью, в кэш не попадает', async () => {
    const api = makeMatrixApi({
      getThumbnail: vi
        .fn<MatrixApi['getThumbnail']>()
        .mockRejectedValue(new MatrixError('M_NOT_FOUND', 'no thumbnail', undefined, 404)),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)
    const size = { width: 320, height: 240 }

    await controller.loadPreview('mxc://bank.ru/abc', size)
    await controller.loadPreview('mxc://bank.ru/abc', size)

    expect(api.downloadMedia).toHaveBeenCalledTimes(2)
  })

  it('отбракованный CDR свой файл не подменяем локальной копией — иначе отправитель не узнает об отказе', async () => {
    const api = makeMatrixApi({
      getThumbnail: vi
        .fn<MatrixApi['getThumbnail']>()
        .mockRejectedValue(new MatrixError('M_NOT_FOUND', 'rejected', undefined, 404)),
      downloadMedia: vi
        .fn<MatrixApi['downloadMedia']>()
        .mockRejectedValue(new MatrixError('M_NOT_FOUND', 'rejected', undefined, 404)),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendFile(makeFile('photo.png', 1, 'image/png'))

    await expect(
      controller.loadPreview('mxc://bank.ru/abc', { width: 320, height: 240 }),
    ).rejects.toMatchObject({ reason: 'rejected' })
  })

  it('после успешной отдачи с сервера локальная копия освобождается', async () => {
    const served = new Blob(['clean'])
    const api = makeMatrixApi({
      getThumbnail: vi.fn<MatrixApi['getThumbnail']>().mockResolvedValue(served),
      downloadMedia: vi
        .fn<MatrixApi['downloadMedia']>()
        .mockRejectedValue(new MatrixError('M_NOT_YET_UPLOADED', 'quarantine', undefined, 504)),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)
    const mxcUrl = 'mxc://bank.ru/abc'

    await controller.sendFile(makeFile('photo.png', 1, 'image/png'))

    // вернулась очищенная сервером версия, а не наш оригинал
    await expect(controller.loadPreview(mxcUrl, { width: 320, height: 240 })).resolves.toBe(served)

    // копии больше нет: даже на 504 подставлять нечего, ошибка доходит до UI
    await expect(controller.downloadFile(mxcUrl)).rejects.toMatchObject({ reason: 'pending' })
  })

  it('смена сессии сбрасывает кэш медиа: чужие байты в новой сессии недоступны', async () => {
    const api = makeMatrixApi()
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)
    const mxcUrl = 'mxc://bank.ru/abc'
    const size = { width: 320, height: 240 }

    await controller.loadPreview(mxcUrl, size)
    controller.disconnect()
    await controller.loadPreview(mxcUrl, size)

    expect(api.getThumbnail).toHaveBeenCalledTimes(2)
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

    const sending = controller.sendFile(makeFile('doc.pdf', 1, 'application/pdf'))
    await vi.waitFor(() => expect(signal).toBeDefined())
    const draft = getState().room.timeline.find((m) => !isSystem(m))!

    controller.cancelUpload(draft.localId)

    expect(signal!.aborted).toBe(true)
    expect(getState().room.timeline).toHaveLength(0)

    // отменённая загрузка не должна оставить после себя ни failed, ни PUT /send
    upload.reject(new DOMException('Upload aborted', 'AbortError'))
    await sending
    expect(applied.some((a) => a.type === 'message.failed')).toBe(false)
    expect(api.sendMessage).not.toHaveBeenCalled()
  })

  // Обе ветки handleAuthError обязаны снять загрузку, и ни одна не может положиться на смену
  // lifecycle: recovery его вовсе не бампает (см. тест про догрузку истории ниже), а при
  // деактивации бампает — но XHR без явного abort всё равно докачает файл в мёртвую сессию.
  // Ошибка при этом прилетает из отправки текста, а не из самой загрузки.
  it.each([
    ['M_UNKNOWN_TOKEN', 'expired'],
    ['M_USER_DEACTIVATED', 'disabled'],
  ])('%s обрывает загрузку в полёте — PUT в мёртвую сессию не уходит', async (errcode, message) => {
    const upload = deferred<Awaited<ReturnType<MatrixApi['uploadMedia']>>>()
    let signal: AbortSignal | undefined
    const api = makeMatrixApi({
      uploadMedia: vi.fn<MatrixApi['uploadMedia']>().mockImplementation((_file, options) => {
        signal = options?.signal
        return upload.promise
      }),
      sendMessage: vi
        .fn<MatrixApi['sendMessage']>()
        .mockRejectedValue(new MatrixError(errcode, message)),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    const sending = controller.sendFile(makeFile('doc.pdf', 1, 'application/pdf'))
    await vi.waitFor(() => expect(signal).toBeDefined())

    await controller.sendMessage('hi')

    expect(signal!.aborted).toBe(true)

    // даже если байты всё-таки дошли, отправлять уже нечего и некуда
    upload.resolve({ content_uri: 'mxc://bank.ru/abc' })
    await sending

    // текстовая отправка выше свой PUT сделала (им и уронили сессию) — важно, что медиа
    // своего не сделала
    const msgtypes = vi.mocked(api.sendMessage).mock.calls.map(([{ content }]) => content.msgtype)
    expect(msgtypes).not.toContain('m.file')
    controller.disconnect()
  })

  it('повтор отправки картинки переиспользует размеры из черновика', async () => {
    // повтор идёт сразу в загрузку, минуя sendFile: размеры взять неоткуда, кроме
    // самого черновика — потому они и живут на нём, а не собираются по пути отправки
    const api = makeMatrixApi({
      uploadMedia: vi
        .fn<MatrixApi['uploadMedia']>()
        .mockRejectedValueOnce(new MatrixError('M_UNKNOWN', 'boom'))
        .mockResolvedValueOnce({ content_uri: 'mxc://bank.ru/retry' }),
    })
    const { controller, getState } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendFile(makeFile('p.png', 1, 'image/png'), { dims: { w: 800, h: 600 } })
    const draft = getState().room.timeline.find((m) => !isSystem(m))!

    await controller.resendMessage(draft.localId)

    expect(api.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ info: expect.objectContaining({ w: 800, h: 600 }) }),
      }),
    )
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

    await controller.sendFile(makeFile('doc.pdf', 1, 'application/pdf'))
    const draft = getState().room.timeline.find((m) => !isSystem(m))!

    await controller.resendMessage(draft.localId)

    // повтор начинается с байт: PUT /send без mxc отправлять нечего
    expect(api.uploadMedia).toHaveBeenCalledTimes(2)
    expect(api.sendMessage).toHaveBeenCalledWith(
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

    const [{ content }] = vi.mocked(api.sendMessage).mock.calls[0]!
    expect(content['m.relates_to']).toEqual({ 'm.in_reply_to': { event_id: '$parent' } })
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

describe('MatrixController — sendCardAction (kc.adaptive.action)', () => {
  const CARD_EVENT_ID = '$card'
  const ACTION = { id: 'confirm', title: 'Подтвердить', data: { action: 'confirm' } }

  it('шлёт контрактные поля, требуемые бэкендом: source_event_id и m.relates_to.rel_type=m.reference', async () => {
    const api = makeMatrixApi()
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendCardAction(CARD_EVENT_ID, ACTION)

    expect(api.sendMessage).toHaveBeenCalledWith({
      roomId: IDENTITY.roomId,
      txnId: expect.any(String),
      content: {
        msgtype: 'kc.adaptive.action',
        body: expect.any(String),
        adaptive_action: {
          action_id: 'confirm',
          source_event_id: CARD_EVENT_ID,
          data: { action: 'confirm' },
        },
        'm.relates_to': { rel_type: 'm.reference', event_id: CARD_EVENT_ID },
      },
    })
  })

  it('успех переводит ответ в card.answering → card.answered', async () => {
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY })

    await controller.sendCardAction(CARD_EVENT_ID, ACTION)

    expect(applied).toContainEqual({
      type: 'card.answering',
      cardEventId: CARD_EVENT_ID,
      actionId: 'confirm',
    })
    expect(applied).toContainEqual({ type: 'card.answered', cardEventId: CARD_EVENT_ID })
  })

  it('второй вызов по уже отправленной/отвечённой карточке не делает HTTP-запрос', async () => {
    const api = makeMatrixApi()
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendCardAction(CARD_EVENT_ID, ACTION)
    await controller.sendCardAction(CARD_EVENT_ID, ACTION)

    expect(api.sendMessage).toHaveBeenCalledOnce()
  })

  it('дедуп проверяет актуальный стор, а не снимок на момент первого вызова — двойной клик до ответа сервера тоже одна отправка', async () => {
    const inFlight = deferred<Awaited<ReturnType<MatrixApi['sendMessage']>>>()
    const api = makeMatrixApi({
      sendMessage: vi.fn<MatrixApi['sendMessage']>().mockReturnValue(inFlight.promise),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    const first = controller.sendCardAction(CARD_EVENT_ID, ACTION)
    await controller.sendCardAction(CARD_EVENT_ID, ACTION)

    expect(api.sendMessage).toHaveBeenCalledOnce()
    inFlight.resolve({ event_id: '$ev' })
    await first
  })

  it('ошибку сети переводит ответ в failed и не бросает наружу', async () => {
    const api = makeMatrixApi({
      sendMessage: vi.fn<MatrixApi['sendMessage']>().mockRejectedValue(new Error('net')),
    })
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendCardAction(CARD_EVENT_ID, ACTION)

    expect(applied).toContainEqual({ type: 'card.answerFailed', cardEventId: CARD_EVENT_ID })
  })

  it('auth-ошибка эскалирует восстановление сессии, как и у обычной отправки', async () => {
    const api = makeMatrixApi({
      sendMessage: vi
        .fn<MatrixApi['sendMessage']>()
        .mockRejectedValue(new MatrixError('M_UNKNOWN_TOKEN', 'expired')),
    })
    const { controller, applied } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.sendCardAction(CARD_EVENT_ID, ACTION)

    await vi.waitFor(() => expect(applied).toContainEqual({ type: 'session.recovering' }))
    controller.disconnect()
  })

  it('без подключения не делает ничего', async () => {
    const api = makeMatrixApi()
    const { controller } = harness({}, api)

    await controller.sendCardAction(CARD_EVENT_ID, ACTION)

    expect(api.sendMessage).not.toHaveBeenCalled()
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
    // disconnect сбросил рантайм, поэтому курсор null; важно, что прерванная страница
    // не успела продвинуть его на свой 'p2'
    expect(getState().room.prevBatch).not.toBe('p2')
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

describe('MatrixController.loadMedia', () => {
  const MXC = 'mxc://bank.ru/abc'
  const SIZE = { width: 320, height: 240 }

  function mediaError(status: number): MatrixError {
    return new MatrixError('M_UNKNOWN', 'media', undefined, status)
  }

  it('404 у превью означает «это не изображение» — идём за оригиналом', async () => {
    const api = makeMatrixApi({
      getThumbnail: vi.fn<MatrixApi['getThumbnail']>().mockRejectedValue(mediaError(404)),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.loadPreview(MXC, SIZE)

    expect(api.downloadMedia).toHaveBeenCalledOnce()
  })

  it('504 (файл ещё в карантине CDR) не подменяется скачиванием оригинала', async () => {
    const api = makeMatrixApi({
      getThumbnail: vi.fn<MatrixApi['getThumbnail']>().mockRejectedValue(mediaError(504)),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    // наружу уходит доменная причина: коды провода за границу matrix/ не проходят
    await expect(controller.loadPreview(MXC, SIZE)).rejects.toMatchObject({
      name: 'MediaUnavailableError',
      reason: 'pending',
    })
    expect(api.downloadMedia).not.toHaveBeenCalled()
  })

  it('403 повторяется ровно один раз — writer мог не успеть записать привязку файла', async () => {
    const api = makeMatrixApi({
      downloadMedia: vi
        .fn<MatrixApi['downloadMedia']>()
        .mockRejectedValueOnce(mediaError(403))
        .mockResolvedValue(new Blob(['bytes'])),
    })
    const { controller } = harness({ phase: 'connected', identity: IDENTITY }, api)

    await controller.downloadFile(MXC)

    expect(api.downloadMedia).toHaveBeenCalledTimes(2)
  })
})
