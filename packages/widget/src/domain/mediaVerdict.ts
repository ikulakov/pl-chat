import { parseMxcUrl } from '../shared/utils/mxc'
import type { MediaTimelineItem, TimelineItem } from './timeline'
import { isMedia } from './timeline'

export type MediaVerdict = { status: 'ready' | 'rejected' }

export interface MediaVerdictEntry {
  mediaId: string
  verdict: MediaVerdict
}

/**
 * Добавляет новые вердикты по mediaId. Вердикт окончательный, поэтому уже известный
 * не перезаписываем: повтор со страницей истории или дубль события не должен его менять.
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

/** Впервые отклонённые файлы: не было в `prev`, в `next` — rejected. */
export function pickFirstRejected(
  prev: Record<string, MediaVerdict>,
  next: Record<string, MediaVerdict>,
  incoming: MediaVerdictEntry[],
): string[] {
  if (prev === next) return []

  const rejected = new Set<string>()

  for (const { mediaId } of incoming) {
    if (!prev[mediaId] && next[mediaId]?.status === 'rejected') rejected.add(mediaId)
  }

  return [...rejected]
}

/** Первое сообщение клиента в ленте с одним из отклоненных файлов; файлы оператора пропускаем. */
export function findOwnMedia(
  timeline: TimelineItem[],
  mediaIds: string[],
  userId: string,
): MediaTimelineItem | undefined {
  const mediaIdSet = new Set(mediaIds)

  return timeline.find((item): item is MediaTimelineItem => {
    if (!isMedia(item) || item.sender !== userId) return false

    const mediaId = parseMxcUrl(item.content.url)?.mediaId
    return !!mediaId && mediaIdSet.has(mediaId)
  })
}
