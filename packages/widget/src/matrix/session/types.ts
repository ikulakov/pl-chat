import type { UserId } from '@/domain/ids'

export interface TokenSource {
  setTokens(accessToken: string, refreshToken?: string): void
  getAccessToken(): string | null
  getRefreshToken(): string | null
}

export interface MatrixSessionStore extends TokenSource {
  setSession(session: SessionInit): void
  getUserId(): UserId | null
  clearSession(): void
}

export interface SessionInit {
  accessToken: string
  refreshToken: string | null
  userId: UserId
}
