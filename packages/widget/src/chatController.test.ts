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

  // close() публичный: в fullscreen-режиме iframe перекрывает FAB хоста, и виджет
  // должен уметь закрыть себя сам (кнопка в Header), не только по команде CLOSE/TOGGLE.
  it('close() can be called directly by the widget itself, not just via a host command', () => {
    const bridge = makeBridge()
    const controller = new ChatController(bridge, makeMatrix())
    controller.handleHostCommand({ type: 'OPEN' })
    vi.mocked(bridge.send).mockClear()

    controller.close()

    expect(chatStore.getState().isOpen).toBe(false)
    expect(bridge.send).toHaveBeenCalledWith({ type: 'CLOSED' })
  })
})

// ---- viewport mode (mobile fullscreen support) ----

describe('ChatController — viewport mode', () => {
  it('INIT with viewport payload stores it', () => {
    const controller = new ChatController(makeBridge(), makeMatrix())

    controller.handleHostCommand({ type: 'INIT', payload: { viewport: 'fullscreen' } })

    expect(chatStore.getState().viewport).toBe('fullscreen')
  })

  it('INIT without viewport payload keeps the current value', () => {
    const controller = new ChatController(makeBridge(), makeMatrix())
    chatStore.getState().setViewport('fullscreen')

    controller.handleHostCommand({ type: 'INIT', payload: {} })

    expect(chatStore.getState().viewport).toBe('fullscreen')
  })

  it('SET_VIEWPORT updates the mode after INIT (resize/orientation change)', () => {
    const controller = new ChatController(makeBridge(), makeMatrix())
    controller.handleHostCommand({ type: 'INIT', payload: { viewport: 'docked' } })

    controller.handleHostCommand({ type: 'SET_VIEWPORT', payload: { mode: 'fullscreen' } })

    expect(chatStore.getState().viewport).toBe('fullscreen')
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
