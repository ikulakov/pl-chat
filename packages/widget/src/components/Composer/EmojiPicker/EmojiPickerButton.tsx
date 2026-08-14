import { useCallback, useRef, useState } from 'react'
import { t } from '../../../i18n'
import { IconButton } from '../../../shared/ui/IconButton'
import { StickerIcon } from '../../../shared/ui/icons'
import styles from './EmojiPicker.module.css'
import { PickerPanel } from './PickerPanel'
import { usePickerDismiss } from './usePickerDismiss'

interface Props {
  onSelectEmoji: (char: string) => void
}

/**
 * Кнопка-триггер вместе с панелью: наружу торчит только выбор эмодзи, всё остальное
 * (открытость, закрытие по Escape и клику вне, возврат фокуса) — внутреннее дело пикера,
 * как у `Dropdown`.
 */
export function EmojiPickerButton({ onSelectEmoji }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const dismiss = useCallback((restoreFocus: boolean) => {
    setIsOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  usePickerDismiss({ isOpen, panelRef, triggerRef, onDismiss: dismiss })

  return (
    <>
      <IconButton
        ref={triggerRef}
        variant="ghost"
        size="sm"
        aria-label={t('input.stickers')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={styles.trigger}
        onClick={() => setIsOpen((open) => !open)}
      >
        <StickerIcon />
      </IconButton>

      {isOpen && (
        <PickerPanel
          ref={panelRef}
          onSelectEmoji={onSelectEmoji}
          // Эмодзи набирают пачками, поэтому панель остаётся открытой; стикер — законченное
          // сообщение, после него ей висеть незачем. Фокус возвращаем на триггер: узел
          // нажатой кнопки исчезает вместе с панелью, и без этого фокус уехал бы в body.
          onStickerSent={() => dismiss(true)}
        />
      )}
    </>
  )
}
