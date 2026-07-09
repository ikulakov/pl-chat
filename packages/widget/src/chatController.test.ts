import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostBridge } from './bridge'
import { ChatController } from './chatController'
import type { MatrixService } from './matrix/matrixController'
import { chatStore } from './store/store'

function makeBridge(): HostBridge {
  return { setCommandHandler: vi.fn(), send: vi.fn() }
}

function makeMatrix(): MatrixService {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  chatStore.getState().closePanel()
})

// ---- panel commands (bridge ↔ store, backend замокан) ----

describe('ChatController — panel commands', () => {
  it('OPEN when closed: opens panel, emits OPENED, connects', () => {
    const bridge = makeBridge()
    const matrix = makeMatrix()
    const controller = new ChatController(bridge, matrix)

    controller.handleHostCommand({ type: 'OPEN' })

    expect(chatStore.getState().isOpen).toBe(true)
    expect(bridge.send).toHaveBeenCalledWith({ type: 'OPENED' })
    expect(matrix.connect).toHaveBeenCalledOnce()
  })

  it('OPEN idempotency: second call does nothing', () => {
    const bridge = makeBridge()
    const matrix = makeMatrix()
    const controller = new ChatController(bridge, matrix)
    controller.handleHostCommand({ type: 'OPEN' })
    vi.mocked(bridge.send).mockClear()
    vi.mocked(matrix.connect).mockClear()

    controller.handleHostCommand({ type: 'OPEN' })

    expect(bridge.send).not.toHaveBeenCalled()
    expect(matrix.connect).not.toHaveBeenCalled()
  })

  it('CLOSE when open: closes panel and emits CLOSED', () => {
    const bridge = makeBridge()
    const controller = new ChatController(bridge, makeMatrix())
    controller.handleHostCommand({ type: 'OPEN' })
    vi.mocked(bridge.send).mockClear()

    controller.handleHostCommand({ type: 'CLOSE' })

    expect(chatStore.getState().isOpen).toBe(false)
    expect(bridge.send).toHaveBeenCalledWith({ type: 'CLOSED' })
  })

  it('CLOSE idempotency: no-op when already closed', () => {
    const bridge = makeBridge()
    const controller = new ChatController(bridge, makeMatrix())

    controller.handleHostCommand({ type: 'CLOSE' })

    expect(bridge.send).not.toHaveBeenCalled()
  })

  it('TOGGLE opens then closes', () => {
    const bridge = makeBridge()
    const controller = new ChatController(bridge, makeMatrix())

    controller.handleHostCommand({ type: 'TOGGLE' })
    expect(chatStore.getState().isOpen).toBe(true)

    controller.handleHostCommand({ type: 'TOGGLE' })
    expect(chatStore.getState().isOpen).toBe(false)
  })
})

// ---- bridge wiring + delegation ----

describe('ChatController — wiring', () => {
  it('registers a command handler on the bridge during construction', () => {
    const bridge = makeBridge()

    new ChatController(bridge, makeMatrix())

    expect(bridge.setCommandHandler).toHaveBeenCalledOnce()
  })

  it('sendMessage / retry delegate to the backend', () => {
    const matrix = makeMatrix()
    const controller = new ChatController(makeBridge(), matrix)

    void controller.sendMessage('hi')
    controller.retry()

    expect(matrix.sendMessage).toHaveBeenCalledWith('hi')
    expect(matrix.connect).toHaveBeenCalledOnce()
  })
})
