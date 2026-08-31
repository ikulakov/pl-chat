import type { ReactNode } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../../i18n'
import { computeDropdownPosition } from './computeDropdownPosition'
import { DropdownContext } from './context'
import styles from './Dropdown.module.css'
import { resolveRoot } from './helpers'
import type { DropdownTriggerProps } from './types'

interface Props {
  trigger: (props: DropdownTriggerProps) => ReactNode
  /** Своя всплывашка над меню (панель реакций): живёт в том же слое и закрывается вместе с ним. */
  above?: ReactNode
  /** Пунктов может не быть вовсе — тогда слой состоит из одной надстройки `above`. */
  children?: ReactNode
}

export function Dropdown({ trigger, above, children }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  // до первого замера меню скрыто (visibility), чтобы не мигнуть в углу 0,0
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [container, setContainer] = useState<Element | ShadowRoot | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const prevOpenRef = useRef(false)
  const skipRestoreRef = useRef(false)

  const open = () => {
    const root = resolveRoot(triggerRef.current)
    setContainer(root instanceof ShadowRoot ? root : root.body)
    setPosition(null)
    setIsOpen(true)
  }

  const close = useCallback(() => setIsOpen(false), [])
  const contextValue = useMemo(() => ({ close }), [close])

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
  }, [close, isOpen])

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
          // Слой меряется и позиционируется целиком: коллизия с краями вьюпорта должна учитывать
          // и надстройку `above`, а внешний клик — не считаться внешним при попадании в неё.
          <div
            ref={dropdownRef}
            className={styles.layer}
            onClick={(event) => {
              // выбор пункта мышью (detail>0) — фокус вернём в body, а не на триггер:
              // иначе :focus-within оставит кнопку действий видимой после закрытия.
              // клавиатурный выбор (Enter/Space → click c detail=0) — фокус возвращаем на триггер.
              //
              // Только клики по самому меню: `above` (панель реакций) слой не закрывает, и
              // взведённый им флаг дожил бы до следующего закрытия по Escape, отобрав возврат
              // фокуса на триггер у совершенно другого взаимодействия.
              if (event.detail > 0 && menuRef.current?.contains(event.target as Node)) {
                skipRestoreRef.current = true
              }
            }}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? 'visible' : 'hidden',
            }}
          >
            {above}

            {children !== undefined && (
              <div
                ref={menuRef}
                role="menu"
                aria-label={t('chat.action.menu')}
                className={styles.dropdown}
                onKeyDown={handleMenuKeyDown}
              >
                <DropdownContext value={contextValue}>{children}</DropdownContext>
              </div>
            )}
          </div>,
          container,
        )}
    </>
  )
}
