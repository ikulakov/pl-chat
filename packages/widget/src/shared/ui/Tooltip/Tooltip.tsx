import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  Ref,
} from 'react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../utils/cn'
import { resolvePortalContainer } from '../floating/portal'
import { useDismiss } from '../floating/useDismiss'
import { readViewport } from '../floating/viewport'
import type { TooltipPlacement } from './utils/computeTooltipPosition'
import { computeTooltipPosition } from './utils/computeTooltipPosition'
import { isInDelayGroup, markTooltipClosed, markTooltipOpened } from './utils/delayGroup'
import styles from './Tooltip.module.css'

const OPEN_DELAY_MS = 400
// задержка на скрытие: за неё курсор успевает пройти зазор до самого тултипа, чтобы текст
// можно было дочитать под лупой (WCAG 1.4.13 — всплывашка должна быть наводимой)
const CLOSE_DELAY_MS = 140

export interface TooltipTriggerProps {
  // any, как HTMLProps в Base UI: Ref<HTMLElement> не присваивается в ref кнопки или div,
  // и без него на месте вызова пришлось бы указывать тип элемента
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: Ref<any>
  onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
  onPointerDown: () => void
  onFocus: (event: ReactFocusEvent<HTMLElement>) => void
  onBlur: () => void
  'aria-describedby': string | undefined
}

interface Props {
  label: string
  /** показывать, только если текст самого триггера обрезан многоточием */
  truncatedOnly?: boolean | undefined
  children: (props: TooltipTriggerProps) => ReactNode
}

/**
 * Подсказка при наведении мышью и фокусе с клавиатуры; на таче не показывается.
 */
export function Tooltip({ label, truncatedOnly = false, children }: Props) {
  const id = useId()
  const triggerRef = useRef<HTMLElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [isOpen, setIsOpen] = useState(false)
  // до первого замера тултип скрыт (visibility), чтобы не мигнуть в углу 0,0
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null)
  const [container, setContainer] = useState<HTMLElement | ShadowRoot | null>(null)
  // зеркало isOpen для колбэков со стабильной ссылкой: им нужно знать, был ли показ,
  // а пересоздавать их на каждое открытие незачем
  const isOpenRef = useRef(false)

  const close = useCallback(() => {
    clearTimeout(openTimer.current)
    clearTimeout(closeTimer.current)
    // окно групповой задержки открывает только реальный показ. Иначе курсор, прошедший по
    // ряду необрезанных кнопок, «оплачивал» бы паузу за них, и первый настоящий тултип
    // выскакивал бы мгновенно.
    if (!isOpenRef.current) return
    isOpenRef.current = false
    setIsOpen(false)
    markTooltipClosed()
  }, [])

  const scheduleClose = useCallback(() => {
    clearTimeout(openTimer.current)
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(close, CLOSE_DELAY_MS)
  }, [close])

  const scheduleOpen = useCallback(() => {
    clearTimeout(closeTimer.current)
    clearTimeout(openTimer.current)

    openTimer.current = setTimeout(
      () => {
        const trigger = triggerRef.current
        if (!trigger) return
        // обрезку меряем в момент показа, а не наведения: ширина могла измениться между ними
        // (ресайз панели, догрузка шрифта)
        if (truncatedOnly && trigger.scrollWidth <= trigger.clientWidth) return

        setContainer(resolvePortalContainer(trigger))
        setPlacement(null)
        markTooltipOpened(close)
        isOpenRef.current = true
        setIsOpen(true)
      },
      isInDelayGroup() ? 0 : OPEN_DELAY_MS,
    )
  }, [close, truncatedOnly])

  const handlePointerEnter = (event: ReactPointerEvent<HTMLElement>) => {
    // pointerType вместо медиазапроса: он описывает конкретный указатель в момент события,
    // поэтому гибридные устройства (тачскрин плюс мышь) работают без подписки на смену
    // указателя. На тач-экране тултипа нет вовсе — там его роль играет долгий тап.
    if (event.pointerType !== 'mouse') return
    scheduleOpen()
  }

  const handleFocus = (event: ReactFocusEvent<HTMLElement>) => {
    // тап по кнопке тоже ставит фокус; :focus-visible отделяет клавиатуру от пальца
    if (!event.currentTarget.matches(':focus-visible')) return
    scheduleOpen()
  }

  // позицию считаем после рендера портала: нужны реальные размеры тултипа для коллизии
  useLayoutEffect(() => {
    if (!isOpen) return
    const trigger = triggerRef.current
    const tooltip = tooltipRef.current
    if (!trigger || !tooltip) return

    setPlacement(
      computeTooltipPosition(
        trigger.getBoundingClientRect(),
        tooltip.getBoundingClientRect(),
        readViewport(),
      ),
    )
  }, [isOpen])

  // нажатие на триггер закрывает само (onPointerDown), нажатие на тултип — нет: он наводимый
  useDismiss(isOpen, [triggerRef, tooltipRef], close)

  useEffect(
    () => () => {
      clearTimeout(openTimer.current)
      clearTimeout(closeTimer.current)
      // размонтирован открытым: иначе группа считала бы его открытым навсегда
      if (isOpenRef.current) markTooltipClosed()
    },
    [],
  )

  return (
    <>
      {children({
        ref: triggerRef,
        onPointerEnter: handlePointerEnter,
        onPointerLeave: scheduleClose,
        // нажатие закрывает сразу: иначе ждём pointerleave, а на кнопке, ставшей disabled
        // после клика (ответ на карточку), браузер может его не прислать
        onPointerDown: close,
        onFocus: handleFocus,
        onBlur: close,
        'aria-describedby': isOpen ? id : undefined,
      })}

      {isOpen &&
        container &&
        createPortal(
          <div
            ref={tooltipRef}
            id={id}
            role="tooltip"
            className={cn(styles.tooltip, placement?.side === 'bottom' && styles.below)}
            style={
              {
                top: placement?.top ?? 0,
                left: placement?.left ?? 0,
                visibility: placement ? 'visible' : 'hidden',
                '--arrow-left': `${placement?.arrowLeft ?? 0}px`,
              } as CSSProperties
            }
            // наведение на сам тултип отменяет закрытие — иначе текст нельзя дочитать
            onPointerEnter={() => clearTimeout(closeTimer.current)}
            onPointerLeave={scheduleClose}
          >
            {label}
          </div>,
          container,
        )}
    </>
  )
}
