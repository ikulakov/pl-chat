export interface ParsedMxcUrl {
  serverName: string
  mediaId: string
}

const MXC_PATTERN = /^mxc:\/\/([^/?#]+)\/([^/?#]+)$/

/**
 * `mxc://bank.ru/AbCdEf…` → `{ serverName, mediaId }`.
 * Всё остальное — включая пустую строку у optimistic-черновика, пока файл не загрузился, — даёт null.
 */
export function parseMxcUrl(url: string): ParsedMxcUrl | null {
  const match = MXC_PATTERN.exec(url)
  if (!match) return null

  return { serverName: match[1]!, mediaId: match[2]! }
}
