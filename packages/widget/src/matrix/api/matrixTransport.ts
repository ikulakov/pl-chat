import type { TokenSource } from '../session/types'
import type { RefreshResponse } from '../wire/dto'
import { Endpoints } from './endpoints'
import { makeMatrixError, MatrixErrCode, MatrixError } from './matrixError'

export interface RequestOptions {
  method?: string
  body?: unknown
  searchParams?: Record<string, string | number>
  signal?: AbortSignal | undefined
}

export interface UploadOptions {
  contentType?: string
  searchParams?: Record<string, string | number>
  signal?: AbortSignal | undefined
  onProgress?: (percent: number) => void
}

export interface DownloadOptions {
  searchParams?: Record<string, string | number>
}

const UPLOAD_TIMEOUT_MS = 120_000
const DOWNLOAD_TIMEOUT_MS = 60_000

export class MatrixTransport {
  private readonly baseUrl: string
  private readonly tokens: TokenSource
  private refreshing: Promise<boolean> | null = null

  constructor(baseUrl: string, tokens: TokenSource) {
    this.baseUrl = baseUrl
    this.tokens = tokens
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.withRefresh(() => this.fetchRequest(path, options))
    return MatrixTransport.unwrapJsonResponse<T>(response)
  }

  async upload<T>(path: string, file: File, options: UploadOptions = {}): Promise<T> {
    const response = await this.withRefresh(() => this.xhrUpload(path, file, options))
    return MatrixTransport.unwrapJsonResponse<T>(response)
  }

  async download(path: string, options: DownloadOptions = {}): Promise<Blob> {
    // Дедлайн обязателен: зависший запрос (уснувшая сеть, прокси съел коннект) не отклонится
    // сам, а его промис лежит в кэше превью — без отказа повтор возвращал бы тот же мёртвый
    // промис до конца сессии. Бюджет общий на запрос и его повтор после refresh.
    const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
    const response = await this.withRefresh(() => this.fetchRequest(path, { ...options, signal }))

    return MatrixTransport.unwrapBlobResponse(response)
  }

  private async withRefresh(call: () => Promise<Response>): Promise<Response> {
    let response = await call()

    // 401 → тихий refresh и один повтор, дальше уйдёт наверх как M_UNKNOWN_TOKEN.
    if (response.status === 401) {
      await response.text()
      const refreshed = await this.silentRefresh()
      if (!refreshed) {
        throw new MatrixError(MatrixErrCode.UnknownToken, 'Session expired')
      }
      response = await call()
    }

    return response
  }

  private fetchRequest(path: string, options: RequestOptions): Promise<Response> {
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

    return fetch(this.buildUrl(path, searchParams), { method, headers, body, signal })
  }

  private xhrUpload(path: string, file: File, options: UploadOptions): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const signal = options.signal
      if (signal?.aborted) {
        reject(new DOMException('Upload aborted', 'AbortError'))
        return
      }

      const xhr = new XMLHttpRequest()
      xhr.open('POST', this.buildUrl(path, options.searchParams))

      const onSignalAbort = () => xhr.abort()
      const cleanup = () => signal?.removeEventListener('abort', onSignalAbort)

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

      xhr.timeout = UPLOAD_TIMEOUT_MS

      xhr.onload = () => {
        cleanup()
        if (xhr.status === 0) {
          reject(new MatrixError(MatrixErrCode.Unknown, 'Network error'))
          return
        }

        resolve(new Response(xhr.responseText || null, { status: xhr.status }))
      }
      xhr.onerror = () => {
        cleanup()
        reject(new MatrixError(MatrixErrCode.Unknown, 'Network error'))
      }
      xhr.onabort = () => {
        cleanup()
        reject(new DOMException('Upload aborted', 'AbortError'))
      }
      xhr.ontimeout = () => {
        cleanup()
        reject(new MatrixError(MatrixErrCode.Unknown, 'Upload timeout'))
      }

      if (signal) {
        signal.addEventListener('abort', onSignalAbort, { once: true })
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

  private static async throwIfError(response: Response): Promise<void> {
    if (!response.ok) throw makeMatrixError(response.status, await response.text())
  }

  private static async unwrapJsonResponse<T>(response: Response): Promise<T> {
    await MatrixTransport.throwIfError(response)

    const text = await response.text()
    return (text ? JSON.parse(text) : {}) as T
  }

  private static async unwrapBlobResponse(response: Response): Promise<Blob> {
    await MatrixTransport.throwIfError(response)
    return response.blob()
  }
}
