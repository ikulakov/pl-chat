import { MATRIX_API_PREFIX } from '../consts'
import type { TokenSource } from '../session/types'
import { isMatrixAuthError, MatrixErrCode, MatrixError } from './matrixError'

export class MatrixTransport {
  private readonly baseUrl: string
  private readonly tokens: TokenSource
  private refreshing: Promise<boolean> | null = null

  constructor(baseUrl: string, tokens: TokenSource) {
    this.baseUrl = baseUrl
    this.tokens = tokens
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchWithAuth(path, init)

    if (res.status === 401) {
      return this.retryAfterRefresh<T>(path, init)
    }
    return this.parseResponse<T>(res)
  }

  private async retryAfterRefresh<T>(path: string, init: RequestInit): Promise<T> {
    const refreshed = await this.silentRefresh()
    if (!refreshed) {
      throw new MatrixError(MatrixErrCode.UnknownToken, 'Session expired')
    }
    return this.parseResponse<T>(await this.fetchWithAuth(path, init))
  }

  private fetchWithAuth(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers)

    const accessToken = this.tokens.getAccessToken()
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }
    headers.set('traceparent', MatrixTransport.makeTraceparent())

    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    return fetch(`${this.baseUrl}${path}`, { ...init, headers })
  }

  private silentRefresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing

    const refreshToken = this.tokens.getRefreshToken()
    if (!refreshToken) return Promise.resolve(false)

    this.refreshing = fetch(`${this.baseUrl}${MATRIX_API_PREFIX}/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        traceparent: MatrixTransport.makeTraceparent(),
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const error = await this.parseError(res)
          if (res.status === 401 || isMatrixAuthError(error)) {
            return false
          }
          throw error
        }
        const data = (await res.json()) as {
          access_token: string
          refresh_token?: string
        }
        // Другая вкладка уже переписала сессию, пока летел наш /refresh — не затираем её.
        if (this.tokens.getRefreshToken() !== refreshToken) {
          // null — сессию снесли (logout), иначе она просто свежее нашей
          return this.tokens.getAccessToken() !== null
        }
        this.tokens.setTokens(data.access_token, data.refresh_token)
        return true
      })
      .finally(() => {
        this.refreshing = null
      })

    return this.refreshing
  }

  private static makeTraceparent(): string {
    const hex = (n: number) =>
      [...crypto.getRandomValues(new Uint8Array(n))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    return `00-${hex(16)}-${hex(8)}-01`
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    if (!res.ok) throw await this.parseError(res)
    if (res.status === 204) return {} as T
    return res.json() as Promise<T>
  }

  private async parseError(res: Response): Promise<MatrixError> {
    try {
      const body = (await res.json()) as { errcode?: string; error?: string }
      return new MatrixError(
        body.errcode ?? MatrixErrCode.Unknown,
        body.error ?? `HTTP ${res.status}`,
      )
    } catch {
      return new MatrixError(MatrixErrCode.Unknown, `HTTP ${res.status}`)
    }
  }
}
