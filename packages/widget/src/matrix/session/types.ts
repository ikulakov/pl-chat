export interface TokenSource {
  setTokens(accessToken: string, refreshToken?: string): void
  getAccessToken(): string | null
  getRefreshToken(): string | null
}

export interface MatrixSessionStore extends TokenSource {
  setSession(session: SessionInit): void
  getUserId(): string | null
  clearSession(): void
}

export interface SessionInit {
  accessToken: string
  refreshToken: string | null
  userId: string
}
