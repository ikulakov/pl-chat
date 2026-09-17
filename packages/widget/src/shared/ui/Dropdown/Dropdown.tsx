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
import { resolvePortalContainer } from '../floating/portal'
import { useDismiss } from '../floating/useDismiss'
import { DropdownContext } from './context'
import styles from './Dropdown.module.css'
import { handleMenuKeyDown } from './menuKeyboard'
import type {
  DropdownCloseOptions,
  DropdownHandle,
  DropdownOpenOptions,
  DropdownTriggerProps,
} from './types'
import { useDropdownPosition } from './useDropdownPosition'

interface Props {
  ref?: Ref<DropdownHandle> | undefined
  trigger: (props: DropdownTriggerProps) => ReactNode
  /** Меню не открывается никаким путём: ни кликом, ни через `open()`. Уходит и в триггер. */
  disabled?: boolean | undefined
  /** Своя всплывашка над меню (панель реакций): живёт в том же слое и закрывается вместе с ним. */
  above?: ReactNode
  /**
   * Пунктов может не быть вовсе — тогда слой состоит из одной надстройки `above`. «Нет пунктов» —
   * это и `undefined`, и `null`/`false` от условного рендера.
   */
  children?: ReactNode
}

export function Dropdown({ ref, trigger, disabled = false, above, children }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [container, setContainer] = useState<HTMLElement | ShadowRoot | null>(null)
  const [withBackdrop, setWithBackdrop] = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  // Относительно чего ставить слой: триггер или то, что передали в open() снаружи.
  const anchorRef = useRef<HTMLElement | null>(null)

  // Стабильная между рендерами, пока не сменились isOpen/disabled: иначе хэндл ниже пересоздавался
  // бы на каждый рендер ряда ленты.
  const open = useCallback(
    ({ anchor, backdrop = false }: DropdownOpenOptions = {}) => {
      // Открытый слой не переоткрываем: позиция посчитана под прежний якорь, а подложка появилась
      // бы без нового открытия — посреди уже идущего взаимодействия.
      if (isOpen || disabled) return

      anchorRef.current = anchor ?? null
      setContainer(resolvePortalContainer(triggerRef.current))
      setWithBackdrop(backdrop)
      setIsOpen(true)
    },
    [isOpen, disabled],
  )

  // Фокус возвращаем прямо здесь, а не эффектом после закрытия: тогда решение «возвращать или
  // нет» принимает тот, кто закрывает, и его не нужно хранить до следующего рендера.
  const close = useCallback(({ returnFocus = true }: DropdownCloseOptions = {}) => {
    if (returnFocus) triggerRef.current?.focus()
    setIsOpen(false)
  }, [])

  useImperativeHandle(ref, () => ({ open }), [open])

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
  // нужен только открытому слою, а закрытый Dropdown стоит в каждом ряду ленты
  const hasItems = isOpen && Children.toArray(children).length > 0

  return (
    <>
      {trigger({
        ref: triggerRef,
        disabled,
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
