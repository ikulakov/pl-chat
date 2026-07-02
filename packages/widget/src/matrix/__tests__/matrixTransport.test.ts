import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeTokenStore } from '../../shared/testUtils/matrixFixtures'
import { LocalStorageSessionStore } from '../session/localStorageSessionStore'
import { MatrixTransport } from '../transport/matrixTransport'

const BASE_URL = 'https://matrix.bank'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('MatrixTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('adds auth, traceparent and default JSON content-type headers', async () => {
    const tokens = createFakeTokenStore('access-token')
    const transport = new MatrixTransport(BASE_URL, tokens)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ ok: true }))

    await transport.request('/_matrix/client/v3/send', { method: 'POST', body: '{}' })

    expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/_matrix/client/v3/send`, expect.anything())
    const headers = fetchSpy.mock.calls[0]![1]!.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer access-token')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('traceparent')).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
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
})
