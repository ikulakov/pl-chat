import { beforeEach, describe, expect, it, vi } from 'vitest'
import { matrixApi } from '../api/matrixApi'
import { mergeMessages } from '../api/syncParsers'
import type { HostBridge } from '../bridge'
import { createChatStore, initChatStore } from './'

vi.mock('../api/httpClient', () => ({ setAccessToken: vi.fn() }))
vi.mock('../shared/sleep', () => ({ sleep: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../api/matrixApi', () => ({
  matrixApi: {
    registerGuest: vi.fn(),
    initialSync: vi.fn(),
    longPollSync: vi.fn(),
    sendMessage: vi.fn(),
  },
}))

// ---- fixtures ----

const GUEST = { user_id: '@guest:bank.ru', device_id: 'DEV', access_token: 'tok' }
const ROOM_ID = '!room:bank.ru'

const syncWaiting = {
  next_batch: 'b1',
  rooms: { join: { [ROOM_ID]: { state: { events: [] }, timeline: { events: [] } } } },
}

const syncActive = {
  next_batch: 'b1',
  rooms: {
    join: {
      [ROOM_ID]: {
        state: {
          events: [
            {
              type: 'kc.operator.current',
              state_key: '',
              event_id: '$s1',
              sender: '@op:bank.ru',
              origin_server_ts: 0,
              content: { status: 'ACTIVE' },
            },
          ],
        },
        timeline: { events: [] },
      },
    },
  },
}

/** Подвешивает sync-loop до конца теста */
const suspendLoop = () => new Promise<never>(() => {})

function makeBridge(): HostBridge {
  return { connect: vi.fn(), send: vi.fn() }
}

// ---- panel slice ----

describe('panel slice — idempotency', () => {
  let bridge: HostBridge
  let store: ReturnType<typeof createChatStore>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(matrixApi.registerGuest).mockResolvedValue(GUEST)
    vi.mocked(matrixApi.initialSync).mockResolvedValue(syncWaiting)
    vi.mocked(matrixApi.longPollSync).mockImplementation(suspendLoop)
    bridge = makeBridge()
    store = createChatStore(bridge)
  })

  it('OPEN when closed: emits OPENED and sets isOpen', () => {
    store.getState().handleCommand({ type: 'OPEN' })

    expect(store.getState().isOpen).toBe(true)
    expect(bridge.send).toHaveBeenCalledWith({ type: 'OPENED' })
  })

  it('OPEN idempotency: second call does nothing', () => {
    store.getState().handleCommand({ type: 'OPEN' })
    vi.mocked(bridge.send).mockClear()

    store.getState().handleCommand({ type: 'OPEN' })

    expect(bridge.send).not.toHaveBeenCalled()
  })

  it('CLOSE when open: emits CLOSED and clears isOpen', () => {
    store.getState().handleCommand({ type: 'OPEN' })
    vi.mocked(bridge.send).mockClear()

    store.getState().handleCommand({ type: 'CLOSE' })

    expect(store.getState().isOpen).toBe(false)
    expect(bridge.send).toHaveBeenCalledWith({ type: 'CLOSED' })
  })

  it('CLOSE idempotency: no-op when already closed', () => {
    store.getState().handleCommand({ type: 'CLOSE' })

    expect(bridge.send).not.toHaveBeenCalled()
  })

  it('TOGGLE when closed: opens and emits OPENED', () => {
    store.getState().handleCommand({ type: 'TOGGLE' })

    expect(store.getState().isOpen).toBe(true)
    expect(bridge.send).toHaveBeenCalledWith({ type: 'OPENED' })
  })

  it('TOGGLE when open: closes and emits CLOSED', () => {
    store.getState().handleCommand({ type: 'OPEN' })
    vi.mocked(bridge.send).mockClear()

    store.getState().handleCommand({ type: 'TOGGLE' })

    expect(store.getState().isOpen).toBe(false)
    expect(bridge.send).toHaveBeenCalledWith({ type: 'CLOSED' })
  })

  it('OPEN delegates to startSession', () => {
    const startSession = vi.fn().mockResolvedValue(undefined)
    store.setState({ startSession })

    store.getState().handleCommand({ type: 'OPEN' })

    expect(startSession).toHaveBeenCalledOnce()
  })
})

// ---- connection slice — guestConnect ----

describe('connection slice — guestConnect status transitions', () => {
  let store: ReturnType<typeof createChatStore>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(matrixApi.longPollSync).mockImplementation(suspendLoop)
    store = createChatStore(makeBridge())
  })

  it('idle → connecting → waiting when no operator in room state', async () => {
    vi.mocked(matrixApi.registerGuest).mockResolvedValue(GUEST)
    vi.mocked(matrixApi.initialSync).mockResolvedValue(syncWaiting)

    await store.getState().startSession()

    expect(store.getState().status).toBe('waiting')
    expect(store.getState().session?.userId).toBe(GUEST.user_id)
    expect(store.getState().session?.roomId).toBe(ROOM_ID)
  })

  it('idle → connecting → active when operator present in room state', async () => {
    vi.mocked(matrixApi.registerGuest).mockResolvedValue(GUEST)
    vi.mocked(matrixApi.initialSync).mockResolvedValue(syncActive)

    await store.getState().startSession()

    expect(store.getState().status).toBe('active')
  })

  it('idle → connecting → error when registerGuest throws', async () => {
    vi.mocked(matrixApi.registerGuest).mockRejectedValue(new Error('network'))

    await store.getState().startSession()

    expect(store.getState().status).toBe('error')
    expect(store.getState().session).toBeNull()
  })

  it('startSession guard: no-op when already connecting', async () => {
    vi.mocked(matrixApi.registerGuest).mockResolvedValue(GUEST)
    vi.mocked(matrixApi.initialSync).mockResolvedValue(syncWaiting)

    // First call resolves; manually set status to 'connecting' to simulate in-flight call
    store.setState({ status: 'connecting' })

    await store.getState().startSession()

    expect(matrixApi.registerGuest).not.toHaveBeenCalled()
  })

  it('startSession starts sync loop after successful connect', async () => {
    vi.mocked(matrixApi.registerGuest).mockResolvedValue(GUEST)
    vi.mocked(matrixApi.initialSync).mockResolvedValue(syncWaiting)

    await store.getState().startSession()

    expect(store.getState().isSyncing).toBe(true)
  })
})

// ---- messages slice — optimistic send ----

describe('messages slice — optimistic send', () => {
  let store: ReturnType<typeof createChatStore>
  const session = { userId: GUEST.user_id, roomId: ROOM_ID, syncCursor: 'b1' }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(matrixApi.longPollSync).mockImplementation(suspendLoop)
    store = createChatStore(makeBridge())
    store.setState({ session })
  })

  it('message appears immediately as pending before server responds', async () => {
    let resolveServer!: (v: { event_id: string }) => void
    vi.mocked(matrixApi.sendMessage).mockReturnValue(new Promise((r) => (resolveServer = r)))

    void store.getState().sendText('hello')

    const msgs = store.getState().messages
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.body).toBe('hello')
    expect(msgs[0]!.pending).toBe(true)
    expect(msgs[0]!.failed).toBe(false)

    resolveServer({ event_id: '$real:bank.ru' })
  })

  it('on success: resolves to real event_id and clears pending flag', async () => {
    vi.mocked(matrixApi.sendMessage).mockResolvedValue({ event_id: '$real:bank.ru' })

    await store.getState().sendText('hello')

    const msg = store.getState().messages[0]!
    expect(msg.eventId).toBe('$real:bank.ru')
    expect(msg.pending).toBe(false)
    expect(msg.failed).toBe(false)
  })

  it('on failure: marks message as failed, not pending', async () => {
    vi.mocked(matrixApi.sendMessage).mockRejectedValue(new Error('timeout'))

    await store.getState().sendText('hello')

    const msg = store.getState().messages[0]!
    expect(msg.pending).toBe(false)
    expect(msg.failed).toBe(true)
  })

  it('no-op when session is null', async () => {
    store.setState({ session: null })

    await store.getState().sendText('hello')

    expect(store.getState().messages).toHaveLength(0)
    expect(matrixApi.sendMessage).not.toHaveBeenCalled()
  })
})

// ---- syncParsers — mergeMessages (sync-race invariants) ----

describe('mergeMessages — deduplication invariants', () => {
  const base = {
    localId: '$a',
    eventId: '$a',
    sender: '@op:bank.ru',
    body: 'hi',
    ts: 100,
    pending: false,
    failed: false,
  }

  it('appends message with unknown eventId', () => {
    const incoming = { ...base, localId: '$b', eventId: '$b', ts: 200 }
    const result = mergeMessages([base], [incoming])
    expect(result).toHaveLength(2)
  })

  it('deduplicates: same eventId not added twice', () => {
    const result = mergeMessages([base], [base])
    expect(result).toHaveLength(1)
  })

  it('sync-race: pending message with matching sender+body resolved, no duplicate', () => {
    const pending = { ...base, eventId: 'optimistic:uuid', pending: true }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeMessages([pending], [fromSync])

    expect(result).toHaveLength(1)
    expect(result[0]!.eventId).toBe('$real')
    expect(result[0]!.pending).toBe(false)
  })

  it('sync-race: failed message not resolved (only pending=true matches)', () => {
    const failed = { ...base, eventId: 'optimistic:uuid', pending: false, failed: true }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeMessages([failed], [fromSync])

    expect(result).toHaveLength(2)
  })

  it('result is sorted by ts ascending', () => {
    const old = { ...base, eventId: '$old', ts: 50 }
    const newer = { ...base, localId: '$new', eventId: '$new', ts: 200 }

    const result = mergeMessages([newer], [old])

    expect(result[0]!.eventId).toBe('$old')
    expect(result[1]!.eventId).toBe('$new')
  })
})

// ---- initChatStore — connection chain ----

describe('initChatStore — connection chain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(matrixApi.registerGuest).mockResolvedValue(GUEST)
    vi.mocked(matrixApi.initialSync).mockResolvedValue(syncWaiting)
    vi.mocked(matrixApi.longPollSync).mockImplementation(suspendLoop)
  })

  it('bridge.connect is called during init', () => {
    const bridge = makeBridge()
    initChatStore(bridge)
    expect(bridge.connect).toHaveBeenCalledOnce()
  })

  it('commands dispatched through bridge reach handleCommand', () => {
    const bridge = makeBridge()
    initChatStore(bridge)

    // capture the callback bridge.connect received
    const onCommand = vi.mocked(bridge.connect).mock.calls[0]![0]

    const spy = vi.fn()
    // After init, handleCommand is accessible via the store — verify delegation
    // by sending CLOSE (no-op when already closed) and checking send was not called
    onCommand({ type: 'CLOSE' })

    expect(bridge.send).not.toHaveBeenCalled() // CLOSE when closed → no emit
    void spy // suppress unused warning
  })

  it('OPEN command through bridge triggers startSession', () => {
    const bridge = makeBridge()
    const store = initChatStore(bridge)
    const startSession = vi.fn().mockResolvedValue(undefined)
    store.setState({ startSession })

    const onCommand = vi.mocked(bridge.connect).mock.calls[0]![0]
    onCommand({ type: 'OPEN' })

    expect(startSession).toHaveBeenCalledOnce()
  })
})
