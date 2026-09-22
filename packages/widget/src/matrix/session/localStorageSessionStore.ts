import type { UserId } from '@/shared/types/ids'
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
  userId: UserId
}

export class LocalStorageSessionStore implements MatrixSessionStore {
  private session: PersistedSession | null = null
  // После неудачной записи/очистки storage может содержать прежнюю сессию.
  // До следующего успешного сохранения доверяем памяти, иначе воскресим старые токены.
  private hasUnpersistedChange = false

  getAccessToken(): string | null {
    return this.readSession()?.accessToken ?? null
  }

  getRefreshToken(): string | null {
    return this.readSession()?.refreshToken ?? null
  }

  getUserId(): UserId | null {
    return this.readSession()?.userId ?? null
  }

  setSession(session: SessionInit): void {
    // Фиксированный TTL ставится один раз — при установлении сессии.
    // silent refresh его НЕ продлевает (см. setTokens),
    // иначе клиент считал бы сессию живой после того, как сервер перестал принимать refresh-токен.
    this.writeSession({
      version: SCHEMA_VERSION,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: Date.now() + GUEST_SESSION_TTL_MS,
      userId: session.userId,
    })
  }

  setTokens(accessToken: string, refreshToken?: string): void {
    const currentSession = this.readSession()
    // Для silent refresh: обновляет токены существующей сессии, сохраняя userId
    // Если сессии нет — обновлять нечего.
    if (!currentSession) return

    this.writeSession({
      ...currentSession,
      accessToken,
      refreshToken: refreshToken ?? currentSession.refreshToken,
    })
  }

  clearSession(): void {
    this.session = null
    try {
      localStorage.removeItem(LOCAL_KEY)
      this.hasUnpersistedChange = false
    } catch {
      this.hasUnpersistedChange = true
    }
  }

  private readSession(): PersistedSession | null {
    if (!this.hasUnpersistedChange) this.readPersistedSession()

    // TTL действует и без storage; silent refresh не продлевает жизнь сессии в памяти.
    if (this.session && this.session.expiresAt <= Date.now()) {
      this.clearSession()
    }
    return this.session
  }

  private readPersistedSession(): void {
    let raw: string | null
    try {
      // При работающем storage сохраняем read-through: refresh/logout другой вкладки видны.
      raw = localStorage.getItem(LOCAL_KEY)
    } catch {
      // Отказ чтения не равен logout: уже известная сессия продолжает работать из памяти.
      return
    }

    if (raw === null) {
      this.session = null
      return
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      if (isPersistedSession(parsed)) {
        this.session = parsed
        return
      }
    } catch {
      // Повреждённая запись, в отличие от недоступного storage, больше не задаёт сессию.
    }
    this.clearSession()
  }

  private writeSession(session: PersistedSession): void {
    this.session = session
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(session))
      this.hasUnpersistedChange = false
    } catch {
      this.hasUnpersistedChange = true
    }
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
