import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeTokenStore } from '../../shared/testUtils/matrixFixtures'
import { LocalStorageSessionStore } from '../session/localStorageSessionStore'
import { MatrixTransport } from './matrixTransport'

const BASE_URL = 'https://matrix.bank'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface FakeProgressEvent {
  lengthComputable: boolean
  loaded: number
  total: number
}

// Минимальный двойник XMLHttpRequest: реальный upload-прогресс недоступен через fetch,
// поэтому MatrixTransport.upload() ходит на XHR напрямую — тестируем именно его.
class FakeXhr {
  static instances: FakeXhr[] = []

  upload: { onprogress: ((e: FakeProgressEvent) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  ontimeout: (() => void) | null = null
  timeout = 0
  status = 200
  responseText = '{}'

  constructor() {
    FakeXhr.instances.push(this)
  }

  open(): void {}
  setRequestHeader(): void {}
  send(): void {}
  abort(): void {
    this.onabort?.()
  }
}

describe('MatrixTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
    FakeXhr.instances.length = 0
  })

  it('adds auth, traceparent and default JSON content-type headers', async () => {
    const tokens = createFakeTokenStore('access-token')
    const transport = new MatrixTransport(BASE_URL, tokens)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ ok: true }))

    await transport.request('/_matrix/client/v3/send', { method: 'POST', body: {} })

    expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/_matrix/client/v3/send`, expect.anything())
    const headers = fetchSpy.mock.calls[0]![1]!.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer access-token')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('traceparent')).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
  })

  it('serializes searchParams into the query string and encodes values', async () => {
    const tokens = createFakeTokenStore('access-token')
    const transport = new MatrixTransport(BASE_URL, tokens)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ ok: true }))

    await transport.request('/_matrix/client/v3/sync', {
      searchParams: { timeout: 0, since: 's 42/&x' },
    })

    // timeout=0 (число → строка), since url-энкодится, порядок = порядок ключей объекта.
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `${BASE_URL}/_matrix/client/v3/sync?timeout=0&since=s+42%2F%26x`,
    )
  })

  it('refreshes on 401 and retries the original request with the new token', async () => {
    const tokens = createFakeTokenStore('old-token', 'refresh-token')
    const transport = new MatrixTransport(BASE_URL, tokens)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ errcode: 'M_UNKNOWN_TOKEN' }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in_ms: 123,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))

    await expect(transport.request('/_matrix/client/v3/sync')).resolves.toEqual({ ok: true })

    // expires_in_ms (123) is present in the response but intentionally not forwarded —
    // expiresAt is a fixed session TTL, not the access token's own expiry.
    expect(tokens.setTokens).toHaveBeenCalledWith('new-token', 'new-refresh')
    expect(fetchSpy.mock.calls[1]![0]).toBe(`${BASE_URL}/_matrix/client/v3/refresh`)
    const refreshHeaders = fetchSpy.mock.calls[1]![1]!.headers as Record<string, string>
    expect(refreshHeaders.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)

    const retryHeaders = fetchSpy.mock.calls[2]![1]!.headers as Headers
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-token')
  })

  it('retries with the fresher session instead of failing when another caller already refreshed', async () => {
    const tokens = createFakeTokenStore('old-token', 'old-refresh')
    const transport = new MatrixTransport(BASE_URL, tokens)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ errcode: 'M_UNKNOWN_TOKEN' }, 401))
      .mockImplementationOnce(async () => {
        // Другая вкладка успела обновить сессию, пока летел наш запрос на /refresh.
        tokens.clearSession()
        tokens.setTokens('guest-token', 'guest-refresh')
        return jsonResponse({
          access_token: 'stale-token',
          refresh_token: 'stale-refresh',
          expires_in_ms: 123,
        })
      })
      .mockResolvedValueOnce(jsonResponse({ ok: true }))

    await expect(transport.request('/_matrix/client/v3/sync')).resolves.toEqual({ ok: true })

    // Свежие токены другой вкладки не затёрты нашим устаревшим ответом.
    expect(tokens.getAccessToken()).toBe('guest-token')
    expect(tokens.getRefreshToken()).toBe('guest-refresh')
    expect(tokens.setTokens).not.toHaveBeenCalledWith('stale-token', 'stale-refresh', 123)

    const retryHeaders = fetchSpy.mock.calls[2]![1]!.headers as Headers
    expect(retryHeaders.get('Authorization')).toBe('Bearer guest-token')
  })

  it('retries with the fresher session instead of failing when another tab already wrote a new session through localStorage', async () => {
    const tokens = new LocalStorageSessionStore()
    tokens.setSession({
      accessToken: 'old-token',
      refreshToken: 'old-refresh',
      userId: '@old:bank',
    })
    const transport = new MatrixTransport(BASE_URL, tokens)

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ errcode: 'M_UNKNOWN_TOKEN' }, 401))
      .mockImplementationOnce(async () => {
        tokens.clearSession()
        tokens.setSession({
          accessToken: 'guest-token',
          refreshToken: 'guest-refresh',
          userId: '@guest:bank',
        })
        return jsonResponse({
          access_token: 'stale-token',
          refresh_token: 'stale-refresh',
        })
      })
      .mockResolvedValueOnce(jsonResponse({ ok: true }))

    await expect(transport.request('/_matrix/client/v3/sync')).resolves.toEqual({ ok: true })

    expect(tokens.getAccessToken()).toBe('guest-token')
    expect(tokens.getRefreshToken()).toBe('guest-refresh')
    expect(tokens.getUserId()).toBe('@guest:bank')

    const retryHeaders = fetchSpy.mock.calls[2]![1]!.headers as Headers
    expect(retryHeaders.get('Authorization')).toBe('Bearer guest-token')
  })

  it('still reports session expired when another tab cleared the session entirely mid-refresh', async () => {
    const tokens = createFakeTokenStore('old-token', 'old-refresh')
    const transport = new MatrixTransport(BASE_URL, tokens)
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ errcode: 'M_UNKNOWN_TOKEN' }, 401))
      .mockImplementationOnce(async () => {
        // Logout/деактивация в другой вкладке: сессии больше нет, подхватывать нечего.
        tokens.clearSession()
        return jsonResponse({ access_token: 'stale-token', refresh_token: 'stale-refresh' })
      })

    await expect(transport.request('/_matrix/client/v3/sync')).rejects.toMatchObject({
      name: 'MatrixError',
      errcode: 'M_UNKNOWN_TOKEN',
    })

    expect(tokens.getAccessToken()).toBeNull()
  })

  it('deduplicates parallel refresh requests', async () => {
    const tokens = createFakeTokenStore('old-token', 'refresh-token')
    const transport = new MatrixTransport(BASE_URL, tokens)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ errcode: 'M_UNKNOWN_TOKEN' }, 401))
      .mockResolvedValueOnce(jsonResponse({ errcode: 'M_UNKNOWN_TOKEN' }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'new-token' }))
      .mockResolvedValueOnce(jsonResponse({ a: 1 }))
      .mockResolvedValueOnce(jsonResponse({ b: 2 }))

    await expect(
      Promise.all([
        transport.request('/_matrix/client/v3/a'),
        transport.request('/_matrix/client/v3/b'),
      ]),
    ).resolves.toEqual([{ a: 1 }, { b: 2 }])

    const refreshCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).endsWith('/_matrix/client/v3/refresh'),
    )
    expect(refreshCalls).toHaveLength(1)
  })

  it('throws MatrixError when refresh fails', async () => {
    const tokens = createFakeTokenStore('old-token', 'refresh-token')
    const transport = new MatrixTransport(BASE_URL, tokens)
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ errcode: 'M_UNKNOWN_TOKEN' }, 401))
      .mockResolvedValueOnce(jsonResponse({ errcode: 'M_UNKNOWN_TOKEN' }, 401))

    await expect(transport.request('/_matrix/client/v3/sync')).rejects.toMatchObject({
      name: 'MatrixError',
      errcode: 'M_UNKNOWN_TOKEN',
    })
  })

  it('rounds upload progress to a whole percent and reports it only when it changes', async () => {
    const tokens = createFakeTokenStore('access-token')
    const transport = new MatrixTransport(BASE_URL, tokens)
    const onProgress = vi.fn()

    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest)

    const uploadPromise = transport.upload('/_matrix/media/v3/upload', new File(['x'], 'a.png'), {
      onProgress,
    })

    const xhr = FakeXhr.instances[0]!
    // 10% и 10.4% округляются в один и тот же процент — второе событие дедуплицируется
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 10 })
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1.04, total: 10 })
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 })
    xhr.onload?.()

    await uploadPromise

    expect(onProgress.mock.calls).toEqual([[10], [50]])
  })

  it('fails a timed out upload with an error distinct from user cancellation', async () => {
    const tokens = createFakeTokenStore('access-token')
    const transport = new MatrixTransport(BASE_URL, tokens)

    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest)

    const uploadPromise = transport.upload('/_matrix/media/v3/upload', new File(['x'], 'a.png'))
    const xhr = FakeXhr.instances[0]!

    // Таймаут выставлен на сам XHR, а не сторожевым таймером: он покрывает и ожидание
    // ответа сервера, где progress-событий уже нет.
    expect(xhr.timeout).toBeGreaterThan(0)

    // Падаем с MatrixError, а НЕ с AbortError: иначе вызывающий примет зависание
    // за отмену пользователя и молча уберёт черновик из ленты.
    xhr.ontimeout?.()

    await expect(uploadPromise).rejects.toMatchObject({ name: 'MatrixError' })
  })

  // Отказ заливки обязан долететь до classifyUploadError: fileguard отвечает 400 с errcode,
  // и если транспорт отдаст это как успешный ответ — черновик застынет «отправленным»,
  // а mxc-ссылки для сообщения не будет.
  it('rejects an upload when the server answers with an error status', async () => {
    const tokens = createFakeTokenStore('access-token')
    const transport = new MatrixTransport(BASE_URL, tokens)

    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest)

    const uploadPromise = transport.upload('/_matrix/media/v3/upload', new File(['x'], 'a.exe'))
    const xhr = FakeXhr.instances[0]!
    xhr.status = 400
    xhr.responseText = JSON.stringify({ errcode: 'M_INVALID_PARAM', error: 'bad type' })
    xhr.onload?.()

    await expect(uploadPromise).rejects.toMatchObject({
      name: 'MatrixError',
      errcode: 'M_INVALID_PARAM',
      status: 400,
    })
  })

  it('throws the terminal MatrixError when refresh reports a deactivated user', async () => {
    const tokens = createFakeTokenStore('old-token', 'refresh-token')
    const transport = new MatrixTransport(BASE_URL, tokens)
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ errcode: 'M_UNKNOWN_TOKEN' }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ errcode: 'M_USER_DEACTIVATED', error: 'disabled' }, 403),
      )

    await expect(transport.request('/_matrix/client/v3/sync')).rejects.toMatchObject({
      name: 'MatrixError',
      errcode: 'M_USER_DEACTIVATED',
    })
  })

  // Бинарный путь заведён отдельно от JSON, поэтому важно, что он не обходит тихий refresh:
  // иначе протухший токен ломал бы картинки до того, как его заметит sync-петля.
  it('download refreshes on 401 and retries with the new token', async () => {
    const tokens = createFakeTokenStore('old-token', 'refresh-token')
    const transport = new MatrixTransport(BASE_URL, tokens)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'new-token', refresh_token: 'new-refresh' }),
      )
      .mockResolvedValueOnce(new Response('bytes', { status: 200 }))

    const blob = await transport.download('/_matrix/client/v1/media/download/bank.ru/abc')

    expect(blob.size).toBe('bytes'.length)
    const retryHeaders = fetchSpy.mock.calls[2]![1]!.headers as Headers
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-token')
  })

  // Ветвление media-ошибок (404 → оригинал, 504 → «ещё проверяется») строится на статусе:
  // шлюз отдаёт такие ответы не-JSON'ом, и errcode в них схлопывается в M_UNKNOWN.
  it('download reports the HTTP status on error responses', async () => {
    const transport = new MatrixTransport(BASE_URL, createFakeTokenStore('token', 'refresh'))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>gateway</html>', {
        status: 504,
      }),
    )

    await expect(
      transport.download('/_matrix/client/v1/media/download/bank.ru/abc'),
    ).rejects.toMatchObject({ name: 'MatrixError', status: 504 })
  })
})
