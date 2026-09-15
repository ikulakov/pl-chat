import type { ReactNode, Ref } from 'react'
import {
  Children,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../../i18n'
import { resolveRoot } from '../../utils/resolveRoot'
import { DropdownContext } from './context'
import styles from './Dropdown.module.css'
import { handleMenuKeyDown } from './menuKeyboard'
import type {
  DropdownCloseOptions,
  DropdownHandle,
  DropdownOpenOptions,
  DropdownTriggerProps,
} from './types'
import { useDismiss } from './useDismiss'
import { useDropdownPosition } from './useDropdownPosition'

interface Props {
  ref?: Ref<DropdownHandle> | undefined
  trigger: (props: DropdownTriggerProps) => ReactNode
  /** Своя всплывашка над меню (панель реакций): живёт в том же слое и закрывается вместе с ним. */
  above?: ReactNode
  /**
   * Пунктов может не быть вовсе — тогда слой состоит из одной надстройки `above`. «Нет пунктов» —
   * это и `undefined`, и `null`/`false` от условного рендера.
   */
  children?: ReactNode
}

export function Dropdown({ ref, trigger, above, children }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [container, setContainer] = useState<Element | ShadowRoot | null>(null)
  const [withBackdrop, setWithBackdrop] = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  // Относительно чего ставить слой: триггер или то, что передали в open() снаружи.
  const anchorRef = useRef<HTMLElement | null>(null)

  const open = ({ anchor, backdrop = false }: DropdownOpenOptions = {}) => {
    // Открытый слой не переоткрываем: позиция посчитана под прежний якорь, а подложка появилась бы
    // без нового открытия — посреди уже идущего взаимодействия. Недоступная кнопка закрывает меню
    // для всех путей открытия, а не только для клика: иначе каждый внешний вызов дублировал бы проверку.
    if (isOpen || triggerRef.current?.disabled) return

    const root = resolveRoot(triggerRef.current)
    anchorRef.current = anchor ?? null
    setContainer(root instanceof ShadowRoot ? root : root.body)
    setWithBackdrop(backdrop)
    setIsOpen(true)
  }

  // Фокус возвращаем прямо здесь, а не эффектом после закрытия: тогда решение «возвращать или
  // нет» принимает тот, кто закрывает, и его не нужно хранить до следующего рендера.
  const close = useCallback(({ returnFocus = true }: DropdownCloseOptions = {}) => {
    if (returnFocus) triggerRef.current?.focus()
    setIsOpen(false)
  }, [])

  useImperativeHandle(ref, () => ({ open }))

  const position = useDropdownPosition({ isOpen, anchorRef, triggerRef, layerRef })

  // Фокус на первый пункт — когда слой измерен: скрытый через visibility элемент не фокусируется.
  useLayoutEffect(() => {
    if (!position) return
    layerRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [position])

  // Подложка в «своих»: её закрывает собственный click. Закройся слой уже на pointerdown,
  // подложка исчезла бы до отпускания пальца, и click достался бы кнопке под ней.
  // После внешнего клика и прокрутки фокус уже у цели — возвращать его на триггер незачем.
  useDismiss(isOpen, [triggerRef, layerRef, backdropRef], (reason) =>
    close({ returnFocus: reason === 'escape' }),
  )

  const contextValue = useMemo(() => ({ close }), [close])
  const hasItems = Children.toArray(children).length > 0

  return (
    <>
      {trigger({
        ref: triggerRef,
        onClick: isOpen ? () => close() : () => open(),
        // eslint-disable-next-line i18next/no-literal-string -- ARIA-роль, не UI-текст
        'aria-haspopup': 'menu',
        'aria-expanded': isOpen,
        // Состояние наружу — атрибутами: потребитель стилизует себя через CSS
        // и не держит своей копии состояния, которая могла бы разойтись с этой.
        'data-popup-open': isOpen ? '' : undefined,
        'data-backdrop': isOpen && withBackdrop ? '' : undefined,
      })}

      {isOpen &&
        container &&
        createPortal(
          <>
            {withBackdrop && (
              <div
                ref={backdropRef}
                className={styles.backdrop}
                aria-hidden="true"
                onClick={() => close({ returnFocus: false })}
              />
            )}

            {/* Слой меряется и позиционируется целиком: коллизия с краями вьюпорта должна
                учитывать и надстройку `above`, а внешний клик — не считаться внешним при
                попадании в неё. */}
            <div
              ref={layerRef}
              className={styles.layer}
              style={{
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                visibility: position ? 'visible' : 'hidden',
              }}
            >
              {above}

              {hasItems && (
                <div
                  role="menu"
                  aria-label={t('chat.action.menu')}
                  className={styles.dropdown}
                  onKeyDown={handleMenuKeyDown}
                >
                  <DropdownContext value={contextValue}>{children}</DropdownContext>
                </div>
              )}
            </div>
          </>,
          container,
        )}
    </>
  )
}
