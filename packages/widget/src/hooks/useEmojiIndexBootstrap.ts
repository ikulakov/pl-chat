import { useEffect } from 'react'
import { FEATURES } from '../features'
import { ensureEmojiIndex } from '../shared/emoji/emojiIndexStore'
import { selectUserId } from '../store/selectors'
import { useChatActions } from './useChatActions'
import { useChatStore } from './useChatStore'

/**
 * Тянет индекс пака эмодзи один раз на вкладку. Лента и цитаты его только читают.
 *
 * Ждём userId: каталог отдаётся под токеном (permitAll только у `/_matrix/emoji/**` и
 * `/_matrix/sticker/**`), а mount-эффект иначе гонится с регистрацией гостя и получает 401 —
 * без refresh-токена его нечем починить, и вся отрисовка эмодзи молча оставалась бы
 * выключенной до перезагрузки страницы.
 *
 * Звать только снаружи `<Activity>`: в режиме `hidden` React размонтирует эффекты поддерева,
 * и загрузка оказалась бы привязана к видимости панели, хотя сессия живёт и при закрытом чате
 * (sync-петля не останавливается).
 */
export function useEmojiIndexBootstrap(): void {
  const userId = useChatStore(selectUserId)
  const { loadEmojiIndex } = useChatActions()

  useEffect(() => {
    if (!FEATURES.emoji || userId === null) return

    ensureEmojiIndex(loadEmojiIndex)
  }, [loadEmojiIndex, userId])
}
