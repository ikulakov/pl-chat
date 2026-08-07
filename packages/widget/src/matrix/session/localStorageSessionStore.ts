import type { MatrixSessionStore, SessionInit } from './types'

const LOCAL_KEY = 'plchat.session'

// TTL гостевой сессии = времени жизни refresh-токена.
// Синхронно с сервером, при необходимости править вручную
const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000

// Версия схемы записи. Поднять если изменится контракт хранения PersistedSession
const SCHEMA_VERSION = 1

interface PersistedSession {
  version: typeof SCHEMA_VERSION
  accessToken: string
  refreshToken: string | null
  expiresAt: number
  userId: string
}

export class LocalStorageSessionStore implements MatrixSessionStore {
  getAccessToken(): string | null {
    return readSession()?.accessToken ?? null
  }

  getRefreshToken(): string | null {
    return readSession()?.refreshToken ?? null
  }

  getUserId(): string | null {
    return readSession()?.userId ?? null
  }

  setSession(session: SessionInit): void {
    // Фиксированный TTL ставится один раз — при установлении сессии.
    // silent refresh его НЕ продлевает (см. setTokens),
    // иначе клиент считал бы сессию живой после того, как сервер перестал принимать refresh-токен.
    writeSession({
      version: SCHEMA_VERSION,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: Date.now() + GUEST_SESSION_TTL_MS,
      userId: session.userId,
    })
  }

  setTokens(accessToken: string, refreshToken?: string): void {
    const currentSession = readSession()
    // Для silent refresh: обновляет токены существующей сессии, сохраняя userId
    // Если сессии нет — обновлять нечего.
    if (!currentSession) return

    writeSession({
      ...currentSession,
      accessToken,
      refreshToken: refreshToken ?? currentSession.refreshToken,
    })
  }

  clearSession(): void {
    removeSession()
  }
}

function readSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)

    if (!isPersistedSession(parsed)) {
      removeSession()
      return null
    }
    if (parsed.expiresAt <= Date.now()) {
      // TTL сессии истёк — считаем, что сессии нет, и чистим.
      removeSession()
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeSession(session: PersistedSession): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(session))
  } catch {
    // localStorage best-effort: при сбое будет новая гостевая регистрация.
  }
}

function removeSession(): void {
  try {
    localStorage.removeItem(LOCAL_KEY)
  } catch {
    // localStorage best-effort: при сбое будет новая гостевая регистрация.
  }
}

function isPersistedSession(value: unknown): value is PersistedSession {
  if (!value || typeof value !== 'object') return false

  const session = value as Partial<PersistedSession>
  return (
    session.version === SCHEMA_VERSION &&
    typeof session.accessToken === 'string' &&
    (typeof session.refreshToken === 'string' || session.refreshToken === null) &&
    typeof session.expiresAt === 'number' &&
    typeof session.userId === 'string'
  )
}
