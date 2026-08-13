import { useEffect, useState } from 'react'
import type { StickerItem, StickerPack } from '../../../domain/emoji'
import { useChatActions } from '../../../hooks/useChatActions'
import { t } from '../../../i18n'
import { StickerView } from '../../Sticker/StickerView'
import styles from './EmojiPicker.module.css'

interface Props {
  /** Контейнер прокрутки панели — он же root наблюдателей, см. PickerPanel. */
  scrollRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Каталог стикеров: одна непрерывная лента с заголовками паков — как и вкладка эмодзи, где
 * категории идут секциями. Отдельной догрузки состава здесь нет: каталог приезжает одним
 * ответом вместе с силуэтами, догружать нечего.
 */
export function StickerGrid({ scrollRef }: Props) {
  const { loadStickerPacks, sendSticker } = useChatActions()
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

  // Пустой список — выключенная на бэкенде фича: сервер отдаёт `{"packs": []}`, а не 403.
  if (packs.length === 0) return <p className={styles.message}>{t('picker.empty')}</p>

  return (
    <div className={styles.stickerPacks}>
      {packs.map((pack) => (
        <section key={pack.id}>
          <h3 className={styles.packTitle}>{pack.title}</h3>

          <div className={styles.stickerGrid}>
            {pack.stickers.map((sticker) => (
              <StickerButton
                key={sticker.id}
                sticker={sticker}
                scrollRef={scrollRef}
                onSelect={() => void sendSticker(sticker)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function StickerButton({
  sticker,
  scrollRef,
  onSelect,
}: {
  sticker: StickerItem
  scrollRef: React.RefObject<HTMLDivElement | null>
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={styles.stickerCell}
      aria-label={sticker.body}
      title={sticker.body}
      onClick={onSelect}
    >
      <StickerView
        sticker={sticker}
        size={72}
        root={scrollRef}
      />
    </button>
  )
}
