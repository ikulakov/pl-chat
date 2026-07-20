import { describe, expect, it, vi } from 'vitest'
import {
  deferred,
  makeMatrixApi,
  messagesResponse,
  OPERATOR_ID,
  roomMessageEvent,
} from '../../shared/testUtils/matrixFixtures'
import { chatRuntimeReducer } from '../../store/reducer'
import type { ChatRuntimeState, RuntimeAction } from '../../store/state'
import { INITIAL_RUNTIME_STATE } from '../../store/store'
import type { MatrixApi } from '../matrixApi'
import { MatrixError } from '../transport/matrixError'
import type { ClientEvent } from '../types'
import { MatrixHistoryLoader } from './historyLoader'

vi.mock('../../shared/sleep', () => ({ sleep: () => Promise.resolve() }))

const ROOM_ID = '!r:bank'

type HistoryPage = Awaited<ReturnType<MatrixApi['getRoomHistory']>>

// событие, которое виджет не рендерит: сервер считает limit по сырым событиям,
// поэтому целая страница может не дать ни одного видимого сообщения
const invisibleEvent: ClientEvent = {
  type: 'm.reaction',
  event_id: '$react1',
  sender: OPERATOR_ID,
  origin_server_ts: 1,
  content: {},
}

// Реальный редьюсер вместо статичного снимка: лоадер перечитывает курсор через getContext
// на каждой итерации, и продвижение prevBatch страницами должно быть настоящим.
function loaderHarness(
  prevBatch: string | null,
  api: MatrixApi = makeMatrixApi(),
  options: { isStale?: () => boolean; onAuthError?: (err: unknown) => boolean } = {},
) {
  let state: ChatRuntimeState = {
    ...INITIAL_RUNTIME_STATE,
    phase: 'connected',
    identity: { userId: '@u:bank', roomId: ROOM_ID },
    room: { ...INITIAL_RUNTIME_STATE.room, prevBatch },
  }
  const applied: RuntimeAction[] = []
  const dispatch = vi.fn((action: RuntimeAction) => {
    applied.push(action)
    state = chatRuntimeReducer(state, action)
  })

  const loader = new MatrixHistoryLoader({
    api,
    dispatch,
    onAuthError: options.onAuthError ?? (() => false),
  })

  const load = () =>
    loader.load({
      getContext: () =>
        state.room.prevBatch === null ? null : { roomId: ROOM_ID, prevBatch: state.room.prevBatch },
      isStale: options.isStale ?? (() => false),
    })

  return { loader, load, dispatch, applied, getState: () => state }
}

describe('MatrixHistoryLoader', () => {
  it('тянет страницу от курсора и кладёт её в начало ленты', async () => {
    const api = makeMatrixApi({
      getRoomHistory: vi
        .fn<MatrixApi['getRoomHistory']>()
        .mockResolvedValue(messagesResponse([roomMessageEvent({ event_id: '$old' })], 'p2')),
    })
    const { load, getState } = loaderHarness('p1', api)

    await load()

    expect(api.getRoomHistory).toHaveBeenCalledExactlyOnceWith(
      ROOM_ID,
      'p1',
      expect.any(AbortSignal),
    )
    expect(getState().room.timeline.map((item) => item.eventId)).toEqual(['$old'])
    expect(getState().room.prevBatch).toBe('p2')
  })

  it('страница без видимых событий не останавливает подгрузку — тянет следующую по end', async () => {
    // иначе лента не изменится, IntersectionObserver повторно не выстрелит, и подгрузка «залипнет»
    const api = makeMatrixApi({
      getRoomHistory: vi
        .fn<MatrixApi['getRoomHistory']>()
        .mockResolvedValueOnce(messagesResponse([invisibleEvent], 'p2'))
        .mockResolvedValueOnce(messagesResponse([roomMessageEvent({ event_id: '$old' })], 'p3')),
    })
    const { load, getState } = loaderHarness('p1', api)

    await load()

    expect(api.getRoomHistory).toHaveBeenNthCalledWith(2, ROOM_ID, 'p2', expect.any(AbortSignal))
    expect(getState().room.timeline.map((item) => item.eventId)).toEqual(['$old'])
    expect(getState().room.prevBatch).toBe('p3')
  })

  it('пустой chunk — признак начала комнаты: курсор гасится, запросы прекращаются', async () => {
    // end сервер отдаёт и на последней непустой странице, поэтому конец ловится только пустым chunk
    const api = makeMatrixApi({
      getRoomHistory: vi.fn<MatrixApi['getRoomHistory']>().mockResolvedValue(messagesResponse([])),
    })
    const { load, getState } = loaderHarness('p1', api)

    await load()
    await load()

    expect(getState().room.prevBatch).toBeNull()
    expect(api.getRoomHistory).toHaveBeenCalledOnce()
  })

  it('без курсора истории запрос не уходит', async () => {
    const api = makeMatrixApi()
    const { load } = loaderHarness(null, api)

    await load()

    expect(api.getRoomHistory).not.toHaveBeenCalled()
  })

  it('пока страница в полёте, повторный триггер скролла не шлёт второй запрос', async () => {
    const page = deferred<HistoryPage>()
    const api = makeMatrixApi({
      getRoomHistory: vi.fn<MatrixApi['getRoomHistory']>().mockReturnValue(page.promise),
    })
    const { load } = loaderHarness('p1', api)

    const inFlight = load()
    await load()

    expect(api.getRoomHistory).toHaveBeenCalledOnce()

    page.resolve(messagesResponse([roomMessageEvent({ event_id: '$old' })], 'p2'))
    await inFlight
  })

  it('транзиентная ошибка ретраится сама; успех догружает ленту', async () => {
    // сетевой блип не должен показывать пользователю ошибку — первая попытка падает,
    // авто-retry со второй берёт страницу
    const api = makeMatrixApi({
      getRoomHistory: vi
        .fn<MatrixApi['getRoomHistory']>()
        .mockRejectedValueOnce(new MatrixError('M_UNKNOWN', 'boom'))
        .mockResolvedValueOnce(messagesResponse([roomMessageEvent({ event_id: '$old' })], 'p2')),
    })
    const { load, getState } = loaderHarness('p1', api)

    await load()

    expect(api.getRoomHistory).toHaveBeenCalledTimes(2)
    expect(getState().room.timeline.map((item) => item.eventId)).toEqual(['$old'])
    expect(getState().room.isLoadingHistory).toBe(false)
    expect(getState().room.prevBatch).toBe('p2')
  })

  it('retry продолжает с курсора, продвинутого невидимой страницей, а не с исходного', async () => {
    // невидимая страница уже легла в стор и сдвинула курсор p1 → p2; упавший запрос за p2
    // должен ретраиться с p2 — иначе повторяем уже пройденную страницу и жжём лимит страниц
    const api = makeMatrixApi({
      getRoomHistory: vi
        .fn<MatrixApi['getRoomHistory']>()
        .mockResolvedValueOnce(messagesResponse([invisibleEvent], 'p2'))
        .mockRejectedValueOnce(new MatrixError('M_UNKNOWN', 'boom'))
        .mockResolvedValueOnce(messagesResponse([roomMessageEvent({ event_id: '$old' })], 'p3')),
    })
    const { load, getState } = loaderHarness('p1', api)

    await load()

    expect(api.getRoomHistory).toHaveBeenNthCalledWith(3, ROOM_ID, 'p2', expect.any(AbortSignal))
    expect(getState().room.timeline.map((item) => item.eventId)).toEqual(['$old'])
    expect(getState().room.prevBatch).toBe('p3')
  })

  it('stop() останавливает ретраи, курсор не тронут', async () => {
    // пользователь отлистал от верха во время сбоя: догрузка снимается,
    // возобновление придёт новым вызовом при возврате к верху
    const ref: { loader?: MatrixHistoryLoader } = {}
    let calls = 0
    const api = makeMatrixApi({
      getRoomHistory: vi.fn<MatrixApi['getRoomHistory']>().mockImplementation(() => {
        // «пользователь ушёл от верха» во время второй попытки
        if (++calls === 2) ref.loader!.stop()
        return Promise.reject(new MatrixError('M_UNKNOWN', 'boom'))
      }),
    })
    const { loader, load, getState } = loaderHarness('p1', api)
    ref.loader = loader

    await load()

    // 1-я попытка + ретрай, оборванный на второй — третьей не будет
    expect(api.getRoomHistory).toHaveBeenCalledTimes(2)
    expect(getState().room.isLoadingHistory).toBe(false)
    // курсор не тронут — возврат к верху продолжит с того же места
    expect(getState().room.prevBatch).toBe('p1')
  })

  it('stop() рвёт запрос в полёте, а не только паузу backoff', async () => {
    // иначе спиннер и запрос переживали бы жест: пользователь ушёл, а страница всё ещё едет
    const page = deferred<HistoryPage>()
    const api = makeMatrixApi({
      getRoomHistory: vi.fn<MatrixApi['getRoomHistory']>().mockReturnValue(page.promise),
    })
    const { loader, load } = loaderHarness('p1', api)

    const inFlight = load()
    loader.stop()

    const signal = vi.mocked(api.getRoomHistory).mock.calls[0]![2]
    expect(signal!.aborted).toBe(true)

    page.resolve(messagesResponse([]))
    await inFlight
  })

  it('терминальная ошибка (onAuthError → true) не ретраится', async () => {
    // мёртвая сессия — не сеть моргнула: retry бессмыслен, владелец уводит в recovery
    const api = makeMatrixApi({
      getRoomHistory: vi
        .fn<MatrixApi['getRoomHistory']>()
        .mockRejectedValue(new MatrixError('M_UNKNOWN_TOKEN', 'expired')),
    })
    const { load } = loaderHarness('p1', api, { onAuthError: () => true })

    await load()

    expect(api.getRoomHistory).toHaveBeenCalledOnce()
  })

  it('устаревший цикл (isStale) не пишет в стор', async () => {
    // сессия пересоздалась под нами между попытками — страница не должна префиксить новую ленту
    const page = deferred<HistoryPage>()
    let stale = false
    const api = makeMatrixApi({
      getRoomHistory: vi
        .fn<MatrixApi['getRoomHistory']>()
        .mockRejectedValueOnce(new MatrixError('M_UNKNOWN', 'boom'))
        .mockReturnValueOnce(page.promise),
    })
    const { load, getState } = loaderHarness('p1', api, { isStale: () => stale })

    const inFlight = load()
    stale = true
    page.resolve(messagesResponse([roomMessageEvent({ event_id: '$old' })], 'p2'))
    await inFlight

    expect(getState().room.timeline).toEqual([])
    expect(getState().room.prevBatch).toBe('p1')
  })
})
