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
})
