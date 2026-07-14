import { describe, expect, it, vi } from 'vitest'
import { createMatrixApi } from './matrixApi'
import type { MatrixTransport } from './transport/matrixTransport'

// matrixController мокает весь MatrixApi, поэтому реальную сборку URL/тела не проверяет
// нигде больше — этот слой тестируется только здесь.
function fakeTransport() {
  const request = vi.fn().mockResolvedValue({})
  return { transport: { request } as unknown as MatrixTransport, request }
}

describe('createMatrixApi — форма запросов', () => {
  it('sendMessage: PUT на send/m.room.message/{txnId}, roomId url-энкодится, тело m.text', async () => {
    const { transport, request } = fakeTransport()

    await createMatrixApi(transport).sendMessage('!room:bank', 'txn-1', 'привет')

    const [path, init] = request.mock.calls[0]!
    // roomId содержит : — без encodeURIComponent (%3A) двоеточие распадётся на лишний сегмент пути
    expect(path).toBe('/_matrix/client/v3/rooms/!room%3Abank/send/m.room.message/txn-1')
    expect(init).toMatchObject({ method: 'PUT' })
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      msgtype: 'm.text',
      body: 'привет',
    })
  })

  it('longPollSync: since + timeout в query, abort-signal пробрасывается', async () => {
    const { transport, request } = fakeTransport()
    const signal = new AbortController().signal

    await createMatrixApi(transport).longPollSync('s42', { signal, timeoutMs: 25_000 })

    const [path, init] = request.mock.calls[0]!
    expect(path).toBe('/_matrix/client/v3/sync?timeout=25000&since=s42')
    expect(init).toEqual({ signal })
  })

  it('initialSync: первый запрос без since, timeout=0', async () => {
    const { transport, request } = fakeTransport()

    await createMatrixApi(transport).initialSync()

    expect(request.mock.calls[0]![0]).toBe('/_matrix/client/v3/sync?timeout=0')
  })

  it('sendReadReceipt: POST на receipt/m.read/{eventId}, roomId и eventId url-энкодятся', async () => {
    const { transport, request } = fakeTransport()

    await createMatrixApi(transport).sendReadReceipt('!room:bank', '$evt:bank')

    const [path, init] = request.mock.calls[0]!
    expect(path).toBe('/_matrix/client/v3/rooms/!room%3Abank/receipt/m.read/%24evt%3Abank')
    expect(init).toMatchObject({ method: 'POST' })
    expect(JSON.parse((init as { body: string }).body)).toEqual({})
  })
})
