import { useRef } from 'react'
import type { MessageKey } from '../../../i18n'
import { t } from '../../../i18n'
import { cn } from '../../../shared/utils/cn'
import styles from './EmojiPicker.module.css'

export type PickerTab = 'emoji' | 'stickers'

const TABS: readonly PickerTab[] = ['emoji', 'stickers']

const LABELS: Record<PickerTab, MessageKey> = {
  emoji: 'picker.tab.emoji',
  stickers: 'picker.tab.stickers',
}

interface Props {
  active: PickerTab
  tabId: (tab: PickerTab) => string
  panelId: (tab: PickerTab) => string
  onChange: (tab: PickerTab) => void
}

export function PickerTabs({ active, tabId, panelId, onChange }: Props) {
  const buttons = useRef(new Map<PickerTab, HTMLButtonElement>())

  // Клавиатура табов по WAI-ARIA: стрелки переключают, Home/End — к краям. Фокус едет
  // за выбором, поэтому переключение с клавиатуры не «теряет» пользователя.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const current = TABS.indexOf(active)
    let next: PickerTab | undefined

    switch (event.key) {
      case 'ArrowRight':
        next = TABS[(current + 1) % TABS.length]
        break
      case 'ArrowLeft':
        next = TABS[(current - 1 + TABS.length) % TABS.length]
        break
      case 'Home':
        next = TABS[0]
        break
      case 'End':
        next = TABS[TABS.length - 1]
        break
      default:
        return
    }

    if (!next) return
    event.preventDefault()
    onChange(next)
    // Узел кнопки переживает перерисовку — фокусировать можно сразу, до применения стейта.
    buttons.current.get(next)?.focus()
  }

  return (
    <div
      role="tablist"
      className={styles.tabs}
      onKeyDown={handleKeyDown}
    >
      {TABS.map((tab) => (
        <button
          key={tab}
          ref={(node) => {
            if (node) buttons.current.set(tab, node)
            else buttons.current.delete(tab)
          }}
          type="button"
          role="tab"
          id={tabId(tab)}
          aria-controls={panelId(tab)}
          aria-selected={tab === active}
          // Ролевая группа — один tab stop: активный в табуляции, остальные достижимы стрелками.
          tabIndex={tab === active ? 0 : -1}
          className={cn(styles.tab, tab === active && styles.tabActive)}
          onClick={() => onChange(tab)}
        >
          {t(LABELS[tab])}
        </button>
      ))}
    </div>
  )
}
