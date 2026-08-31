/** Вердикт проверки файла (kc.media.status), терминален: ready или rejected — без промежутков. */
export type MediaVerdict = { status: 'ready' } | { status: 'rejected' }

export interface MediaVerdictEntry {
  mediaId: string
  verdict: MediaVerdict
}

/**
 * Мерджит вердикты по mediaId. Терминален — уже известный вердикт не перезаписываем
 * (повторная доставка страницы истории/дубль события не должны дребезжать).
 */
export function applyMediaVerdicts(
  existing: Record<string, MediaVerdict>,
  incoming: MediaVerdictEntry[],
): Record<string, MediaVerdict> {
  if (incoming.length === 0) return existing

  let result = existing

  for (const { mediaId, verdict } of incoming) {
    // Проверяем аккумулятор, а не исходную карту: в одном батче (таймлайн /sync, страница
    // истории) может прийти два вердикта по одному media_id, и при проверке `existing`
    // побеждал бы последний — rejected молча превращался бы в ready.
    if (result[mediaId]) continue

    if (result === existing) result = { ...existing }
    result[mediaId] = verdict
  }

  return result
}
