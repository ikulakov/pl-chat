import type { RefreshResponse } from '../dto'
import { Endpoints } from '../endpoints'
import type { TokenSource } from '../session/types'
import { makeMatrixError, MatrixErrCode, MatrixError } from './matrixError'

export interface UploadOptions {
  contentType?: string
  searchParams?: Record<string, string | number>
  signal?: AbortSignal | undefined
  onProgress?: (percent: number) => void
}

export interface RequestOptions {
  method?: string
  // JSON-сериализуемое тело: транспорт сам делает JSON.stringify + Content-Type.
  // request() обслуживает только JSON; бинарная загрузка идёт через upload().
  body?: unknown
  searchParams?: Record<string, string | number>
  signal?: AbortSignal | undefined
}

// Нормализованный ответ любого транспорта (fetch/XHR)
interface RawResponse {
  status: number
  text: string
}

export class MatrixTransport {
  private readonly baseUrl: string
  private readonly tokens: TokenSource
  private refreshing: Promise<boolean> | null = null

  constructor(baseUrl: string, tokens: TokenSource) {
    this.baseUrl = baseUrl
    this.tokens = tokens
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.withRefresh<T>(() => this.fetchRaw(path, options))
  }

  async upload<T>(path: string, file: File, options: UploadOptions = {}): Promise<T> {
    return this.withRefresh<T>(() => this.xhrUpload(path, file, options))
  }

  private async withRefresh<T>(call: () => Promise<RawResponse>): Promise<T> {
    let response = await call()

    // 401 → тихий refresh и один повтор, дальше уйдёт наверх как M_UNKNOWN_TOKEN.
    if (response.status === 401) {
      const refreshed = await this.silentRefresh()
      if (!refreshed) {
        throw new MatrixError(MatrixErrCode.UnknownToken, 'Session expired')
      }
      response = await call()
    }

    return MatrixTransport.unwrapResponse<T>(response)
  }

  private async fetchRaw(path: string, options: RequestOptions): Promise<RawResponse> {
    const { method = 'GET', searchParams, signal = null } = options

    const headers = new Headers()
    const body = options.body === undefined ? null : JSON.stringify(options.body)

    const accessToken = this.tokens.getAccessToken()
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }
    if (body) {
      headers.set('Content-Type', 'application/json')
    }
    headers.set('traceparent', MatrixTransport.makeTraceparent())

    const res = await fetch(this.buildUrl(path, searchParams), { method, headers, body, signal })

    return { status: res.status, text: await res.text() }
  }

  private xhrUpload(path: string, file: File, options: UploadOptions): Promise<RawResponse> {
    return new Promise<RawResponse>((resolve, reject) => {
      const signal = options.signal
      if (signal?.aborted) {
        reject(new DOMException('Upload aborted', 'AbortError'))
        return
      }

      const xhr = new XMLHttpRequest()
      xhr.open('POST', this.buildUrl(path, options.searchParams))

      const accessToken = this.tokens.getAccessToken()
      if (accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
      }
      xhr.setRequestHeader(
        'Content-Type',
        options.contentType || file.type || 'application/octet-stream',
      )
      xhr.setRequestHeader('traceparent', MatrixTransport.makeTraceparent())

      const onProgress = options.onProgress
      if (onProgress) {
        let lastPercent = -1

        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable || e.total <= 0) return

          const percent = Math.round((e.loaded / e.total) * 100)
          if (percent === lastPercent) return

          lastPercent = percent
          onProgress(percent)
        }
      }

      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText })
      xhr.onerror = () => reject(new MatrixError(MatrixErrCode.Unknown, 'Network error'))
      xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'))

      if (signal) {
        signal.addEventListener('abort', () => xhr.abort(), { once: true })
      }
      xhr.send(file)
    })
  }

  private buildUrl(path: string, searchParams?: Record<string, string | number>): string {
    const url = `${this.baseUrl}${path}`

    if (!searchParams) return url

    const query = new URLSearchParams(
      Object.entries(searchParams).map(([key, value]) => [key, String(value)]),
    ).toString()

    return query ? `${url}?${query}` : url
  }

  private silentRefresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing

    const refreshToken = this.tokens.getRefreshToken()
    if (!refreshToken) return Promise.resolve(false)

    this.refreshing = fetch(`${this.baseUrl}${Endpoints.REFRESH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        traceparent: MatrixTransport.makeTraceparent(),
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) return false
          throw makeMatrixError(res.status, await res.text())
        }
        const data = (await res.json()) as RefreshResponse
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

  private static unwrapResponse<T>(res: RawResponse): T {
    if (res.status >= 200 && res.status < 300) {
      return (res.text ? JSON.parse(res.text) : {}) as T
    }
    throw makeMatrixError(res.status, res.text)
  }
}
