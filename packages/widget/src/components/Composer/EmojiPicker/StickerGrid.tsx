import { useEffect, useState } from 'react'
import type { StickerPack } from '../../../domain/emoji'
import { useChatActions } from '../../../hooks/useChatActions'
import { t } from '../../../i18n'
import { Endpoints } from '../../../matrix/api/endpoints'
import styles from './EmojiPicker.module.css'

/**
 * Каталог стикеров. Отправки в этой итерации нет: клик по стикеру — это `m.sticker`, а не
 * вставка в текст, и он тянет за собой отправку, оптимистичный элемент и ветку рендера
 * в ленте. Пока вкладка только показывает набор.
 */
export function StickerGrid() {
  const { loadStickerPacks } = useChatActions()
  const [packs, setPacks] = useState<StickerPack[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true

    loadStickerPacks()
      .then((loaded) => {
        if (alive) setPacks(loaded)
      })
      .catch((err: unknown) => {
        console.error('[PLChat] sticker packs failed:', err)
        if (alive) setFailed(true)
      })

    return () => {
      alive = false
    }
  }, [loadStickerPacks])

  if (failed) return <p className={styles.message}>{t('picker.loadFailed')}</p>
  if (packs === null) return <p className={styles.message}>{t('status.loading')}</p>

  const stickers = packs.flatMap((pack) => pack.stickers)
  if (stickers.length === 0) return <p className={styles.message}>{t('picker.empty')}</p>

  return (
    <div className={styles.stickerGrid}>
      {stickers.map((sticker) => (
        <img
          key={sticker.id}
          className={styles.sticker}
          // Публичный эндпоинт: байты стикеров отдаются без токена и кешируются на неделю,
          // поэтому обычный <img> вместо fetch→blob, как у пользовательских медиа.
          src={Endpoints.STICKER_BYTES({ mediaId: sticker.mediaId })}
          alt={sticker.body}
          title={sticker.body}
          loading="lazy"
        />
      ))}
    </div>
  )
}
