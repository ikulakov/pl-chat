import { isEnvelope, makeEnvelope } from '@bankchat/protocol'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { BankChatClient } from '../client'
import { IframeView } from '../iframe'

const CHAT_ORIGIN = 'http://localhost:5174'

const mockContentWindow = { postMessage: vi.fn() }

const mockSetAppearance = vi.fn()
const mockIframeOpen = vi.fn()
const mockIframeClose = vi.fn()
const mockIframeToggle = vi.fn()
const mockIframeLoad = vi.fn()

vi.mock('../iframe', () => ({
  IframeView: vi.fn().mockImplementation(() => ({
    mount: vi.fn(),
    open: mockIframeOpen,
    close: mockIframeClose,
    toggle: mockIframeToggle,
    load: mockIframeLoad,
    setAppearance: mockSetAppearance,
    getViewportMode: vi.fn().mockReturnValue('docked'),
    get contentWindow() {
      return mockContentWindow
    },
  })),
}))

function sentTypes(portSend: ReturnType<typeof vi.fn>): string[] {
  return portSend.mock.calls.map(([envelope]) => envelope.msg.type)
}

/** Выполняет `beforeReady` на неготовом канале, затем доводит хендшейк до INIT_ACK. */
function handshake(beforeReady: () => void): ReturnType<typeof vi.fn> {
  const portSend = vi.fn()
  const mockPort1 = { onmessage: null as unknown, postMessage: portSend }
  vi.spyOn(globalThis, 'MessageChannel').mockImplementationOnce(
    () => ({ port1: mockPort1, port2: {} }) as unknown as MessageChannel,
  )

  beforeReady()
  expect(portSend).not.toHaveBeenCalled()

  window.dispatchEvent(makeReadyEvent())
  ;(mockPort1.onmessage as (e: MessageEvent) => void)(
    new MessageEvent('message', { data: makeEnvelope({ type: 'INIT_ACK' }) }),
  )

  return portSend
}

function makeReadyEvent(overrides: Partial<MessageEventInit> = {}): MessageEvent {
  return new MessageEvent('message', {
    origin: CHAT_ORIGIN,
    source: mockContentWindow as unknown as Window,
    data: makeEnvelope({ type: 'READY' }),
    ...overrides,
  })
}

describe('BankChatClient.onWindowMessage — security guards', () => {
  let client: BankChatClient
  let tracked: Array<[string, EventListenerOrEventListenerObject]> = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let addEventListenerSpy: ReturnType<typeof vi.spyOn<any, any>>

  beforeAll(() => {
    const orig = window.addEventListener.bind(window)
    addEventListenerSpy = vi
      .spyOn(window, 'addEventListener')
      .mockImplementation(
        (type: string, handler: EventListenerOrEventListenerObject, opts?: unknown) => {
          tracked.push([type, handler])
          orig(type, handler, opts as AddEventListenerOptions)
        },
      )
  })

  afterAll(() => {
    addEventListenerSpy.mockRestore()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    tracked = []
    client = new BankChatClient()
    client.init({ chatUrl: CHAT_ORIGIN })
  })

  afterEach(() => {
    tracked.forEach(([type, handler]) => window.removeEventListener(type, handler))
  })

  it('ignores message from wrong origin', () => {
    window.dispatchEvent(makeReadyEvent({ origin: 'http://evil.com' }))
    expect(mockContentWindow.postMessage).not.toHaveBeenCalled()
  })

  it('ignores message from wrong source', () => {
    window.dispatchEvent(makeReadyEvent({ source: window }))
    expect(mockContentWindow.postMessage).not.toHaveBeenCalled()
  })

  it('ignores non-envelope data', () => {
    window.dispatchEvent(makeReadyEvent({ data: { not: 'an envelope' } }))
    expect(mockContentWindow.postMessage).not.toHaveBeenCalled()
  })

  it('ignores non-READY envelope', () => {
    window.dispatchEvent(makeReadyEvent({ data: makeEnvelope({ type: 'INIT_ACK' }) }))
    expect(mockContentWindow.postMessage).not.toHaveBeenCalled()
  })

  it('sends INIT with exact targetOrigin on valid READY', () => {
    window.dispatchEvent(makeReadyEvent())

    expect(mockContentWindow.postMessage).toHaveBeenCalledOnce()
    const [data, targetOrigin] = mockContentWindow.postMessage.mock.calls[0] as [unknown, string]
    expect(isEnvelope(data)).toBe(true)
    expect((data as { msg: { type: string } }).msg.type).toBe('INIT')
    expect(targetOrigin).toBe(CHAT_ORIGIN)
  })
})

describe('BankChatClient — command queue', () => {
  let client: BankChatClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new BankChatClient()
    client.init({ chatUrl: CHAT_ORIGIN })
  })

  // preload='on-open' грузит виджет только по открытию. Если ждать разбора очереди,
  // получится тупик: очередь ждёт INIT_ACK, а INIT_ACK — загрузки виджета.
  it('запускает загрузку виджета при open() до готовности канала, а не только при разборе очереди', () => {
    client.open()

    expect(mockIframeLoad).toHaveBeenCalled()

    // Доводим хендшейк: клиент снимает свой window-листенер только на валидном READY,
    // иначе недоинициализированный клиент перехватит READY следующего теста.
    window.dispatchEvent(makeReadyEvent())
  })

  // Непанельные команды (сегодня SET_VIEWPORT, завтра SET_LOCALE/SET_AUTH) обязаны
  // пережить неготовый канал: терять их молча — источник багов, который не видно.
  it('буферизует непанельные команды до INIT_ACK и отправляет после', () => {
    const portSend = handshake(() => {
      const { onViewportChange } = vi.mocked(IframeView).mock.calls.at(-1)![0]
      onViewportChange?.('fullscreen')
    })

    expect(sentTypes(portSend)).toEqual(['SET_VIEWPORT'])
  })

  // Виджет на OPEN не только разворачивает панель и забирает фокус, но и поднимает
  // Matrix-сессию (register + sync). Проигрывать лог команд — значит поднять её для
  // диалога, от которого пользователь уже отказался.
  it('открытие и отмена до готовности не отправляют ни одной команды панели', () => {
    const portSend = handshake(() => {
      client.open()
      client.close()
    })

    expect(sentTypes(portSend)).toEqual([])
    expect(mockIframeOpen).not.toHaveBeenCalled()
  })

  it('открытие до готовности отправляет ровно один OPEN после INIT_ACK', () => {
    const portSend = handshake(() => {
      client.open()
      client.close()
      client.open()
    })

    expect(sentTypes(portSend)).toEqual(['OPEN'])
  })
})

describe('BankChatClient — состояние рамки', () => {
  let client: BankChatClient
  let portSend: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    client = new BankChatClient()
    client.init({ chatUrl: CHAT_ORIGIN })

    portSend = vi.fn()
    const mockPort1 = { onmessage: null as unknown, postMessage: portSend }
    vi.spyOn(globalThis, 'MessageChannel').mockImplementationOnce(
      () => ({ port1: mockPort1, port2: {} }) as unknown as MessageChannel,
    )
    window.dispatchEvent(makeReadyEvent())
    ;(mockPort1.onmessage as (e: MessageEvent) => void)(
      new MessageEvent('message', { data: makeEnvelope({ type: 'INIT_ACK' }) }),
    )
  })

  // Ответного OPENED ждать нельзя: пока рамка 0×0, виджет уже рисует панель и его
  // ResizeObserver/IntersectionObserver считают геометрию по пустому боксу.
  it('разворачивает рамку сразу с командой OPEN, не дожидаясь ответного OPENED', () => {
    client.open()

    expect(mockIframeOpen).toHaveBeenCalledOnce()
    expect(portSend.mock.calls.at(-1)?.[0].msg.type).toBe('OPEN')
  })

  it('сворачивает рамку сразу с командой CLOSE', () => {
    client.close()

    expect(mockIframeClose).toHaveBeenCalledOnce()
  })

  it('переключает рамку сразу с командой TOGGLE', () => {
    client.toggle()

    expect(mockIframeToggle).toHaveBeenCalledOnce()
    expect(portSend.mock.calls.at(-1)?.[0].msg.type).toBe('TOGGLE')
  })
})

describe('BankChatClient — рамка до готовности канала', () => {
  // Пока бандл виджета не загружен, разворачивать бокс нечем: хост увидит пустой
  // белый прямоугольник. Особенно заметно при preload='on-open'.
  it('держит рамку свёрнутой до INIT_ACK и разворачивает по нему', () => {
    vi.clearAllMocks()
    const client = new BankChatClient()
    client.init({ chatUrl: CHAT_ORIGIN })

    const mockPort1 = { onmessage: null as unknown, postMessage: vi.fn() }
    vi.spyOn(globalThis, 'MessageChannel').mockImplementationOnce(
      () => ({ port1: mockPort1, port2: {} }) as unknown as MessageChannel,
    )

    client.open()
    expect(mockIframeOpen).not.toHaveBeenCalled()

    window.dispatchEvent(makeReadyEvent())
    ;(mockPort1.onmessage as (e: MessageEvent) => void)(
      new MessageEvent('message', { data: makeEnvelope({ type: 'INIT_ACK' }) }),
    )

    expect(mockIframeOpen).toHaveBeenCalledOnce()
  })
})

describe('BankChatClient.setAppearance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Позиция контейнера не едет по протоколу, поэтому смена не должна ждать INIT_ACK:
  // иначе хост не сможет подвинуть панель, пока виджет ещё грузится.
  it('applies without waiting for the handshake', () => {
    const client = new BankChatClient()
    client.init({ chatUrl: CHAT_ORIGIN })

    client.setAppearance({ offsetY: 160 })

    expect(mockSetAppearance).toHaveBeenCalledWith({ offsetY: 160 })
  })

  it('merges over the appearance given at init', () => {
    const client = new BankChatClient()
    client.init({ chatUrl: CHAT_ORIGIN, appearance: { corner: 'bottom-left', offsetY: 80 } })

    client.setAppearance({ offsetY: 160 })

    expect(mockSetAppearance).toHaveBeenCalledWith({ corner: 'bottom-left', offsetY: 160 })
  })

  it('ignores the call before init instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = new BankChatClient()

    client.setAppearance({ offsetY: 160 })

    expect(mockSetAppearance).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
