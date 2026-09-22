import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageSessionStore } from './localStorageSessionStore'

const STORAGE_KEY = 'plchat.session'

function rawSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 1_000,
    userId: '@u:bank',
    ...overrides,
  }
}

describe('LocalStorageSessionStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    localStorage.clear()
  })

  it('discards a persisted session past its 24h expiresAt and starts fresh', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rawSession({ expiresAt: Date.now() - 1 })))

    const store = new LocalStorageSessionStore()

    expect(store.getAccessToken()).toBeNull()
    expect(store.getRefreshToken()).toBeNull()
    expect(store.getUserId()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('keeps a persisted session whose 24h expiresAt has not passed yet, even if the access token itself looks stale', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        rawSession({ accessToken: 'still-within-session-ttl', expiresAt: Date.now() + 1_000 }),
      ),
    )

    const store = new LocalStorageSessionStore()

    expect(store.getAccessToken()).toBe('still-within-session-ttl')
    expect(store.getRefreshToken()).toBe('refresh')
    expect(store.getUserId()).toBe('@u:bank')
  })

  it('ignores malformed stored sessions', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rawSession({ accessToken: 123 })))

    const store = new LocalStorageSessionStore()

    expect(store.getAccessToken()).toBeNull()
    expect(store.getRefreshToken()).toBeNull()
    expect(store.getUserId()).toBeNull()
  })

  it('discards a pre-migration record missing userId or a schema version (treated as malformed)', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accessToken: 'old-shape-access',
        refreshToken: 'old-shape-refresh',
        expiresAt: Date.now() + 1_000,
      }),
    )

    const store = new LocalStorageSessionStore()

    expect(store.getAccessToken()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('ignores setTokens when no session exists (establishment goes through setSession)', () => {
    const store = new LocalStorageSessionStore()

    store.setTokens('orphan-access', 'orphan-refresh')

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(store.getAccessToken()).toBeNull()
  })

  it('does not extend expiresAt on a subsequent setTokens call (fixed session TTL, not sliding)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const originalExpiresAt = Date.now() + 12 * 60 * 60 * 1000
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        rawSession({
          accessToken: 'old-access',
          refreshToken: 'old-refresh',
          expiresAt: originalExpiresAt,
        }),
      ),
    )
    const store = new LocalStorageSessionStore()

    vi.setSystemTime(new Date('2026-01-01T06:00:00.000Z'))
    store.setTokens('new-access', 'new-refresh')

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: originalExpiresAt,
      userId: '@u:bank',
    })
  })

  it('writes the whole session atomically via setSession with a fixed 24h TTL, ignoring the access token TTL (a separate concern)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const store = new LocalStorageSessionStore()

    store.setSession({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      userId: '@u:bank',
    })

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      userId: '@u:bank',
    })
  })

  it('establishes a fresh 24h expiresAt after clearSession(), not the previous session boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const store = new LocalStorageSessionStore()
    store.setSession({ accessToken: 'access-1', refreshToken: 'refresh-1', userId: '@u:bank' })

    vi.setSystemTime(new Date('2026-01-01T06:00:00.000Z'))
    store.clearSession()
    store.setSession({ accessToken: 'access-2', refreshToken: 'refresh-2', userId: '@u:bank' })

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      userId: '@u:bank',
    })
  })

  it('sees tokens written to localStorage by another tab (read-through getters)', () => {
    const store = new LocalStorageSessionStore()
    store.setSession({
      accessToken: 'tab-a-access',
      refreshToken: 'tab-a-refresh',
      userId: '@tab-a:bank',
    })

    // Simulate another tab's LocalStorageSessionStore instance silently refreshing
    // and persisting new tokens, bypassing this instance entirely.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        rawSession({
          accessToken: 'tab-b-access',
          refreshToken: 'tab-b-refresh',
          userId: '@tab-b:bank',
        }),
      ),
    )

    expect(store.getAccessToken()).toBe('tab-b-access')
    expect(store.getRefreshToken()).toBe('tab-b-refresh')
    expect(store.getUserId()).toBe('@tab-b:bank')
  })

  it('treats a session cleared by another tab (e.g. logout) as no session', () => {
    const store = new LocalStorageSessionStore()
    store.setSession({
      accessToken: 'tab-a-access',
      refreshToken: 'tab-a-refresh',
      userId: '@tab-a:bank',
    })

    localStorage.removeItem(STORAGE_KEY)

    expect(store.getAccessToken()).toBeNull()
    expect(store.getRefreshToken()).toBeNull()
    expect(store.getUserId()).toBeNull()
  })

  it('keeps a new session in memory when persistence fails over an older record', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rawSession()))
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    const store = new LocalStorageSessionStore()

    store.setSession({ accessToken: 'new', refreshToken: 'new-refresh', userId: '@new:bank' })
    write.mockRestore()

    // Чтение снова работает, но в storage всё ещё лежит прежняя сессия.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).accessToken).toBe('access')
    expect(store.getAccessToken()).toBe('new')
    expect(store.getRefreshToken()).toBe('new-refresh')
    expect(store.getUserId()).toBe('@new:bank')
  })

  it('keeps refreshed tokens when their persistence fails', () => {
    const store = new LocalStorageSessionStore()
    store.setSession({ accessToken: 'old', refreshToken: 'refresh', userId: '@u:bank' })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    store.setTokens('new')

    expect(store.getAccessToken()).toBe('new')
    expect(store.getRefreshToken()).toBe('refresh')
    expect(store.getUserId()).toBe('@u:bank')
  })

  it('retains a hydrated session during a read failure and sees external logout after recovery', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rawSession()))
    const store = new LocalStorageSessionStore()
    expect(store.getAccessToken()).toBe('access')
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })

    expect(store.getAccessToken()).toBe('access')
    expect(store.getRefreshToken()).toBe('refresh')
    expect(store.getUserId()).toBe('@u:bank')

    localStorage.removeItem(STORAGE_KEY)
    read.mockRestore()
    expect(store.getAccessToken()).toBeNull()
    expect(store.getRefreshToken()).toBeNull()
    expect(store.getUserId()).toBeNull()
  })

  it('does not resurrect a cleared session or refresh it when removal fails', () => {
    const store = new LocalStorageSessionStore()
    store.setSession({ accessToken: 'old', refreshToken: 'refresh', userId: '@u:bank' })
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })

    store.clearSession()
    remove.mockRestore()
    store.setTokens('late-access', 'late-refresh')

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    expect(store.getAccessToken()).toBeNull()
    expect(store.getRefreshToken()).toBeNull()
    expect(store.getUserId()).toBeNull()
  })

  it('resumes read-through after a later successful write', () => {
    const store = new LocalStorageSessionStore()
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    store.setSession({ accessToken: 'memory', refreshToken: 'refresh', userId: '@u:bank' })
    write.mockRestore()

    store.setTokens('persisted')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).accessToken).toBe('persisted')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rawSession({ accessToken: 'other-tab' })))
    expect(store.getAccessToken()).toBe('other-tab')
  })

  it('resumes read-through after a later successful clear', () => {
    const store = new LocalStorageSessionStore()
    store.setSession({ accessToken: 'old', refreshToken: 'refresh', userId: '@u:bank' })
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })
    store.clearSession()
    remove.mockRestore()

    store.clearSession()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rawSession({ userId: '@other:bank' })))
    expect(store.getUserId()).toBe('@other:bank')
  })

  it('expires a memory-only session at its original deadline despite a refresh', () => {
    vi.useFakeTimers()
    const start = new Date('2026-01-01T00:00:00.000Z').getTime()
    vi.setSystemTime(start)
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })
    const store = new LocalStorageSessionStore()
    expect(store.getAccessToken()).toBeNull()
    store.setSession({ accessToken: 'first', refreshToken: 'refresh', userId: '@u:bank' })

    vi.setSystemTime(start + 6 * 60 * 60 * 1000)
    store.setTokens('refreshed', 'next-refresh')
    expect(store.getAccessToken()).toBe('refreshed')
    expect(store.getRefreshToken()).toBe('next-refresh')

    vi.setSystemTime(start + 24 * 60 * 60 * 1000)
    expect(store.getAccessToken()).toBeNull()
    expect(store.getRefreshToken()).toBeNull()
    expect(store.getUserId()).toBeNull()
    store.setTokens('late')
    expect(store.getAccessToken()).toBeNull()
  })

  it('expires the cached session even while reads fail', () => {
    vi.useFakeTimers()
    const start = Date.now()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rawSession({ expiresAt: start + 1000 })))
    const store = new LocalStorageSessionStore()
    expect(store.getAccessToken()).toBe('access')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })

    vi.setSystemTime(start + 1000)
    expect(store.getAccessToken()).toBeNull()
    expect(store.getUserId()).toBeNull()
  })

  it('clears cached credentials when the readable record becomes malformed', () => {
    const store = new LocalStorageSessionStore()
    store.setSession({ accessToken: 'old', refreshToken: 'refresh', userId: '@u:bank' })
    localStorage.setItem(STORAGE_KEY, '{broken')

    expect(store.getAccessToken()).toBeNull()
    expect(store.getRefreshToken()).toBeNull()
    expect(store.getUserId()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
