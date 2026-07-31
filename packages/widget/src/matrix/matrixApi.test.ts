import { describe, expect, it, vi } from 'vitest'
import { createMatrixApi } from './matrixApi'
import type { MatrixTransport } from './transport/matrixTransport'

// matrixController мокает весь MatrixApi, поэтому реальную сборку URL/тела не проверяет
// нигде больше — этот слой тестируется только здесь.
function fakeTransport() {
  const request = vi.fn().mockResolvedValue({})
  const upload = vi.fn().mockResolvedValue({})
  return { transport: { request, upload } as unknown as MatrixTransport, request, upload }
}

describe('createMatrixApi — форма запросов', () => {
  it('sendMessage: PUT на send/m.room.message/{txnId}, roomId url-энкодится, тело m.text', async () => {
    const { transport, request } = fakeTransport()

    await createMatrixApi(transport).sendMessage({
      roomId: '!room:bank',
      txnId: 'txn-1',
      content: { body: 'привет' },
    })

    const [path, init] = request.mock.calls[0]!
    // roomId содержит : — без encodeURIComponent (%3A) двоеточие распадётся на лишний сегмент пути
    expect(path).toBe('/_matrix/client/v3/rooms/!room%3Abank/send/m.room.message/txn-1')
    expect(init).toMatchObject({ method: 'PUT' })
    expect((init as { body: unknown }).body).toEqual({
      msgtype: 'm.text',
      body: 'привет',
    })
  })

  it('sendMessage: reply кладёт m.relates_to.m.in_reply_to.event_id и не пишет fallback в body', async () => {
    const { transport, request } = fakeTransport()

    await createMatrixApi(transport).sendMessage({
      roomId: '!room:bank',
      txnId: 'txn-1',
      content: { body: 'ок' },
      replyToEventId: '$parent:bank',
    })

    const [, init] = request.mock.calls[0]!
    expect((init as { body: unknown }).body).toEqual({
      msgtype: 'm.text',
      body: 'ок',
      'm.relates_to': { 'm.in_reply_to': { event_id: '$parent:bank' } },
    })
  })

  it('sendMediaMessage: без подписи body на wire падает на filename (MSC2530), kind → msgtype', async () => {
    // домен держит подпись и имя файла раздельно (body пуст без подписи), но на проводе
    // body не бывает пустым — иначе клиенты без media-рендерера покажут пустое сообщение
    const { transport, request } = fakeTransport()

    await createMatrixApi(transport).sendMediaMessage({
      roomId: '!room:bank',
      txnId: 'txn-1',
      kind: 'image',
      content: {
        body: '',
        url: 'mxc://bank.ru/abc',
        filename: 'p.png',
        info: { mimetype: 'image/png', size: 10 },
      },
    })

    const [, init] = request.mock.calls[0]!
    expect((init as { body: unknown }).body).toMatchObject({
      msgtype: 'm.image',
      body: 'p.png',
      filename: 'p.png',
    })
  })

  it('sendMediaMessage: подпись переживает отправку, reply едет тем же m.relates_to', async () => {
    const { transport, request } = fakeTransport()

    await createMatrixApi(transport).sendMediaMessage({
      roomId: '!room:bank',
      txnId: 'txn-1',
      kind: 'file',
      content: {
        body: 'смотри договор',
        url: 'mxc://bank.ru/abc',
        filename: 'doc.pdf',
        info: { mimetype: 'application/pdf', size: 10 },
      },
      replyToEventId: '$parent:bank',
    })

    const [, init] = request.mock.calls[0]!
    expect((init as { body: unknown }).body).toMatchObject({
      msgtype: 'm.file',
      body: 'смотри договор',
      'm.relates_to': { 'm.in_reply_to': { event_id: '$parent:bank' } },
    })
  })

  it('longPollSync: since + timeout в searchParams, abort-signal пробрасывается', async () => {
    const { transport, request } = fakeTransport()
    const signal = new AbortController().signal

    await createMatrixApi(transport).longPollSync('s42', { signal, timeoutMs: 25_000 })

    const [path, init] = request.mock.calls[0]!
    expect(path).toBe('/_matrix/client/v3/sync')
    expect(init).toEqual({ searchParams: { timeout: 25_000, since: 's42' }, signal })
  })

  it('initialSync: первый запрос без since, timeout=0', async () => {
    const { transport, request } = fakeTransport()

    await createMatrixApi(transport).initialSync()

    const [path, init] = request.mock.calls[0]!
    expect(path).toBe('/_matrix/client/v3/sync')
    expect(init).toEqual({ searchParams: { timeout: 0 } })
  })

  it('sendReadReceipt: POST на receipt/m.read/{eventId}, roomId и eventId url-энкодятся', async () => {
    const { transport, request } = fakeTransport()

    await createMatrixApi(transport).sendReadReceipt('!room:bank', '$evt:bank')

    const [path, init] = request.mock.calls[0]!
    expect(path).toBe('/_matrix/client/v3/rooms/!room%3Abank/receipt/m.read/%24evt%3Abank')
    expect(init).toMatchObject({ method: 'POST' })
    expect((init as { body: unknown }).body).toEqual({})
  })

  it('getRoomHistory: GET на rooms/{roomId}/messages, roomId энкодится, dir/from/limit в searchParams', async () => {
    const { transport, request } = fakeTransport()
    const signal = new AbortController().signal

    await createMatrixApi(transport).getRoomHistory('!room:bank', 't-99', signal)

    const [path, init] = request.mock.calls[0]!
    expect(path).toBe('/_matrix/client/v3/rooms/!room%3Abank/messages')
    // limit — литерал 50 (независимый оракул wire-контракта, не импорт приватной константы)
    expect(init).toEqual({ searchParams: { dir: 'b', from: 't-99', limit: 50 }, signal })
  })

  it('uploadMedia: filename уходит в searchParams сырым (кодирует транспорт), options пробрасываются', async () => {
    const { transport, upload } = fakeTransport()
    const file = new File(['x'], 'отчёт.pdf', { type: 'application/pdf' })
    const signal = new AbortController().signal
    const onProgress = vi.fn()

    await createMatrixApi(transport).uploadMedia(file, { signal, onProgress })

    const [path, uploadedFile, options] = upload.mock.calls[0]!
    expect(path).toBe('/_matrix/media/v3/upload')
    expect(uploadedFile).toBe(file)
    // filename — не пред-энкоденный: раньше был ручной encodeURIComponent, теперь сырое имя в searchParams
    expect(options).toEqual({ signal, onProgress, searchParams: { filename: 'отчёт.pdf' } })
  })
})
