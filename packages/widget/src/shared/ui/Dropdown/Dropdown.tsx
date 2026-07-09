import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { computeDropdownPosition } from './computeDropdownPosition'
import styles from './Dropdown.module.css'
import { resolveRoot } from './helpers'
import type { DropdownTriggerProps } from './types'
import { t } from '../../../i18n'

interface Props {
  trigger: (props: DropdownTriggerProps) => ReactNode
  children: (props: { close: () => void }) => ReactNode
}

export function Dropdown({ trigger, children }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  // до первого замера меню скрыто (visibility), чтобы не мигнуть в углу 0,0
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [container, setContainer] = useState<Element | ShadowRoot | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const prevOpenRef = useRef(false)
  const skipRestoreRef = useRef(false)

  const open = () => {
    const root = resolveRoot(triggerRef.current)
    setContainer(root instanceof ShadowRoot ? root : root.body)
    setPosition(null)
    setIsOpen(true)
  }

  // ref-free намеренно: передаётся в children и вызывается во время их рендера, а
  // react-compiler запрещает доступ к ref в рендере. Возврат фокуса — в эффекте ниже.
  const close = () => setIsOpen(false)

  // позицию считаем после рендера портала — нужны реальные размеры меню для коллизии с краями
  useLayoutEffect(() => {
    if (!isOpen) return
    const trigger = triggerRef.current
    const dropdown = dropdownRef.current
    if (!trigger || !dropdown) return

    const rect = trigger.getBoundingClientRect()
    const menu = dropdown.getBoundingClientRect()

    setPosition(
      computeDropdownPosition(rect, menu, { width: window.innerWidth, height: window.innerHeight }),
    )
  }, [isOpen])

  // фокус на первый пункт, когда меню стало видимым (visibility:hidden сфокусировать нельзя)
  useLayoutEffect(() => {
    if (!isOpen || !position) return
    dropdownRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [isOpen, position])

  // возврат фокуса на триггер при закрытии; skipRestore (outside/scroll) — фокус уже на цели клика
  useLayoutEffect(() => {
    const wasOpen = prevOpenRef.current
    prevOpenRef.current = isOpen
    if (wasOpen && !isOpen && !skipRestoreRef.current) triggerRef.current?.focus()
    skipRestoreRef.current = false
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const closeWithoutFocusRestore = () => {
      skipRestoreRef.current = true
      close()
    }

    const onOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      // pointerdown предшествует click пункта — закрывать только настоящий внешний клик,
      // иначе меню исчезнет раньше, чем долетит click по пункту
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      closeWithoutFocusRestore()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onScroll = () => {
      closeWithoutFocusRestore()
    }

    document.addEventListener('pointerdown', onOutsidePointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)

    return () => {
      document.removeEventListener('pointerdown', onOutsidePointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [isOpen])

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      dropdownRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    )
    if (items.length === 0) return
    const active = resolveRoot(dropdownRef.current).activeElement
    const current = items.indexOf(active as HTMLElement)

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        items[(current + 1) % items.length]?.focus()
        break
      case 'ArrowUp':
        event.preventDefault()
        items[(current - 1 + items.length) % items.length]?.focus()
        break
      case 'Home':
        event.preventDefault()
        items[0]?.focus()
        break
      case 'End':
        event.preventDefault()
        items[items.length - 1]?.focus()
        break
    }
  }

  return (
    <>
      {trigger({
        ref: triggerRef,
        onClick: isOpen ? close : open,
        // eslint-disable-next-line i18next/no-literal-string -- ARIA-роль, не UI-текст
        'aria-haspopup': 'menu',
        'aria-expanded': isOpen,
      })}

      {isOpen &&
        container &&
        createPortal(
          <div
            ref={dropdownRef}
            role="menu"
            aria-label={t('chat.action.menu')}
            className={styles.dropdown}
            onKeyDown={handleMenuKeyDown}
            onClick={(event) => {
              // выбор пункта мышью (detail>0) — фокус вернём в body, а не на триггер:
              // иначе :focus-within оставит кнопку действий видимой после закрытия.
              // клавиатурный выбор (Enter/Space → click c detail=0) — фокус возвращаем на триггер.
              if (event.detail > 0) skipRestoreRef.current = true
            }}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? 'visible' : 'hidden',
            }}
          >
            {children({ close })}
          </div>,
          container,
        )}
    </>
  )
}
