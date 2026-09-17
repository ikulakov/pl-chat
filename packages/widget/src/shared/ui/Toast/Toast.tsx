import { useEffect, useRef, useState } from 'react'
import { cn } from '../../utils/cn'
import { CheckmarkIcon, ErrorCircleIcon } from '../icons'
import styles from './Toast.module.css'
import type { ToastItem } from './toastStore'
import { dismissToast } from './toastStore'

const DURATION_MS = 5000

interface Props {
  toast: ToastItem
}

/**
 * Одна плашка. Уходит сама, крестика нет. Клик, если он задан, только срезает путь — например
 * ведёт к сообщению в ленте. Поэтому всё, что тост сообщает, должно дублироваться состоянием
 * в ленте: плашка может истечь раньше, чем до неё дотянутся.
 */
export function Toast({ toast }: Props) {
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isTabHidden, setIsTabHidden] = useState(() => document.hidden)
  const remainingRef = useRef(DURATION_MS)

  // фокус держит плашку по той же причине, что и курсор: до кликабельного тоста ещё надо
  // дотабать, и отсчёт не должен съесть его под пальцами
  const isPaused = isHovered || isFocused || isTabHidden

  // Вкладка в фоне — таймер стоит: иначе тост истечёт, пока его никто не видит.
  useEffect(() => {
    const onVisibilityChange = () => setIsTabHidden(document.hidden)

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (isPaused) return

    const startedAt = Date.now()
    const timer = setTimeout(() => dismissToast(toast.id), remainingRef.current)

    return () => {
      clearTimeout(timer)
      // на паузе остаток замораживается, и следующий запуск дотикает именно его
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt))
    }
  }, [isPaused, toast.id])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissToast(toast.id)
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [toast.id])

  const content = (
    <>
      {toast.tone === 'success' ? (
        <CheckmarkIcon className={styles.icon} />
      ) : (
        <ErrorCircleIcon className={styles.icon} />
      )}
      {toast.message}
    </>
  )

  const className = cn(styles.toast, styles[toast.tone])

  const shared = {
    onPointerEnter: () => setIsHovered(true),
    onPointerLeave: () => setIsHovered(false),
  }

  // Плашка без действия остаётся простым div: кнопка без обработчика ловила бы фокус впустую.
  if (!toast.onClick) {
    return (
      <div
        className={className}
        {...shared}
      >
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={cn(className, styles.clickable)}
      onClick={() => {
        toast.onClick?.()
        dismissToast(toast.id)
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      {...shared}
    >
      {content}
    </button>
  )
}
