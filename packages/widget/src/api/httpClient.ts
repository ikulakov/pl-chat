let accessToken: string | null = null
let onUnauthorized: (() => void) | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

function makeTraceparent(): string {
  const hex = (n: number) =>
    [...crypto.getRandomValues(new Uint8Array(n))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  return `00-${hex(16)}-${hex(8)}-01`
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    traceparent: makeTraceparent(),
    ...(options?.headers as Record<string, string>),
  }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  const response = await fetch(`/_matrix/client/v3${path}`, { ...options, headers })

  if (response.status === 401) {
    onUnauthorized?.()
    throw new MatrixApiError('M_UNKNOWN_TOKEN', 401)
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    throw new MatrixApiError(
      String(body['errcode'] ?? 'M_UNKNOWN'),
      response.status,
      String(body['error'] ?? ''),
    )
  }

  return response.json()
}

export class MatrixApiError extends Error {
  readonly errcode: string
  readonly status: number

  constructor(errcode: string, status: number, message = '') {
    super(message || errcode)
    this.name = 'MatrixApiError'
    this.errcode = errcode
    this.status = status
  }
}
