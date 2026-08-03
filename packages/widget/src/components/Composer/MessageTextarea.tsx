import { useLayoutEffect } from 'react'
import styles from './MessageTextarea.module.css'

interface Props {
  value: string
  placeholder: string
  ref: React.RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
  onSubmit: () => void
  onEscape?: (() => void) | undefined
}

export const MAX_MESSAGE_LENGTH = 32_000

/**
 * Поле ввода композера: изменяет размер при вводе текста, до 10 строк далее скролл,
 * Enter отправка, Shift+Enter перенос строки.
 */
export function MessageTextarea({ value, placeholder, ref, onChange, onSubmit, onEscape }: Props) {
  useLayoutEffect(() => {
    const textarea = ref.current

    if (!textarea?.clientWidth) return

    // Фиксируем высоту контейнера на время замера.
    // Иначе  браузер сбрасывает scrollTop ленты — прилипание к низу ломается.
    const container = textarea.parentElement
    container?.style.setProperty('min-height', `${container.offsetHeight}px`)

    textarea.style.height = 'auto'
    textarea.style.height = textarea.scrollHeight + 'px'
    container?.style.removeProperty('min-height')
  }, [value, ref])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
      return
    }
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault()
      onEscape()
    }
  }

  return (
    <textarea
      ref={ref}
      name="message"
      className={styles.textarea}
      placeholder={placeholder}
      aria-label={placeholder}
      autoComplete="off"
      rows={1}
      maxLength={MAX_MESSAGE_LENGTH}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
    />
  )
}
