import { useEffect } from 'react'

interface Params {
  isOpen: boolean
  panelRef: React.RefObject<HTMLElement | null>
  triggerRef: React.RefObject<HTMLElement | null>
  onDismiss: (restoreFocus: boolean) => void
}

/**
 * Закрытие панели по Escape и клику снаружи.
 *
 * Списано с `shared/ui/Dropdown`, но без закрытия по `scroll`: у пикера собственная
 * скроллящаяся сетка, и обработчик фазы захвата закрывал бы панель от прокрутки её же
 * содержимого. По той же причине пикер не портал — он живёт внутри композера.
 */
export function usePickerDismiss({ isOpen, panelRef, triggerRef, onDismiss }: Params): void {
  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      // pointerdown прилетает раньше click по ячейке: без проверки на попадание внутрь
      // панель исчезала бы до того, как долетит выбор эмодзи.
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return

      // Фокус уже уехал на цель клика — возвращать его на кнопку значило бы его отобрать.
      onDismiss(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      // Composer вешает свой Escape на textarea (отмена цитаты) — не даём ему сработать
      // заодно с закрытием панели.
      event.stopPropagation()
      onDismiss(true)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, panelRef, triggerRef, onDismiss])
}
