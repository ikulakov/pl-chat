import { scrollTimelineTo } from '../shared/timeline/timelineScroll'
import { findOwnMedia, pickFirstRejected } from '../domain/mediaVerdict'
import { t } from '../i18n'
import { showToast } from '../shared/ui/Toast'
import type { DispatchMiddleware } from '../store/store'

/**
 * Тост «файл не прошёл проверку безопасности» с переходом к сообщению.
 *
 * Реагируем только на `sync.received` для пользовательских файлов
 */
export const mediaRejectedToast: DispatchMiddleware =
  ({ getState }) =>
  (next) =>
  (action) => {
    const prevState = getState()

    next(action)

    if (action.type !== 'sync.received' || !action.room) return

    const nextState = getState()
    const userId = nextState.identity?.userId
    const freshIds = pickFirstRejected(
      prevState.room.mediaVerdicts,
      nextState.room.mediaVerdicts,
      action.room.mediaVerdicts,
    )
    if (!freshIds.length || !userId) return

    const media = findOwnMedia(nextState.room.timeline, freshIds, userId)
    if (media) {
      showToast(t('chat.media.rejected'), () => scrollTimelineTo(media.localId))
    }
  }
