/** Лимит размера postmessage сообщения (anti-DoS) */
export const MAX_MESSAGE_BYTES = 16 * 1024

/** Приблизительный размер сообщения в байтах (UTF-8) */
function messageSize(msg: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(msg ?? null)).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function withinSizeLimit(msg: unknown, limit = MAX_MESSAGE_BYTES): boolean {
  return messageSize(msg) <= limit
}
