import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hostBridge } from '../bridge'
import { ChatStore } from './chatStore'

vi.mock('../bridge', () => ({ hostBridge: { send: vi.fn() } }))

describe('ChatStore.handleCommand', () => {
  let store: ChatStore

  beforeEach(() => {
    store = new ChatStore()
    vi.mocked(hostBridge.send).mockClear()
  })

  it('does not emit OPENED when already open', () => {
    store.handleCommand({ type: 'OPEN' })
    vi.mocked(hostBridge.send).mockClear()

    store.handleCommand({ type: 'OPEN' })

    expect(hostBridge.send).not.toHaveBeenCalled()
  })

  it('does not emit CLOSED when already closed', () => {
    store.handleCommand({ type: 'CLOSE' })

    expect(hostBridge.send).not.toHaveBeenCalled()
  })

  it('closes and emits CLOSED on TOGGLE when open', () => {
    store.handleCommand({ type: 'OPEN' })
    vi.mocked(hostBridge.send).mockClear()

    store.handleCommand({ type: 'TOGGLE' })

    expect(store.getState().isOpen).toBe(false)
    expect(hostBridge.send).toHaveBeenCalledWith({ type: 'CLOSED' })
  })

  it('stops notifications after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()

    store.handleCommand({ type: 'OPEN' })

    expect(listener).not.toHaveBeenCalled()
  })
})
