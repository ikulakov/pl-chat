import { isEnvelope, makeEnvelope } from '@bankchat/protocol'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { BankChatClient } from '../client'

const CHAT_ORIGIN = 'http://localhost:5174'

const mockContentWindow = { postMessage: vi.fn() }

vi.mock('../iframe', () => ({
  IframeView: vi.fn().mockImplementation(() => ({
    mount: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    get contentWindow() {
      return mockContentWindow
    },
  })),
}))

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

  it('buffers commands before INIT_ACK and flushes after', () => {
    const portSend = vi.fn()
    const mockPort1 = { onmessage: null as unknown, postMessage: portSend }
    const mockPort2 = {}

    vi.spyOn(globalThis, 'MessageChannel').mockImplementationOnce(
      () => ({ port1: mockPort1, port2: mockPort2 }) as unknown as MessageChannel,
    )

    client.open()
    client.close()
    expect(portSend).not.toHaveBeenCalled()

    window.dispatchEvent(makeReadyEvent())

    const initAckEnvelope = makeEnvelope({ type: 'INIT_ACK' })
    ;(mockPort1.onmessage as (e: MessageEvent) => void)(
      new MessageEvent('message', { data: initAckEnvelope }),
    )

    expect(portSend).toHaveBeenCalledTimes(2)
    expect(portSend.mock.calls[0][0].msg.type).toBe('OPEN')
    expect(portSend.mock.calls[1][0].msg.type).toBe('CLOSE')
  })
})
